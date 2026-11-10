import { EventStream } from './eventStream';
import {
  CreateSessionAgentRef,
  CreateSessionAgentSpec,
  GetSessionResponse,
  TrueForgeConfig,
  TurnEventCallback,
  TurnStreamingEvent,
} from './types';

export const DEFAULT_CONFIG: TrueForgeConfig = {
  baseUrl: 'http://localhost:8790',
  model: 'google-gemini/gemini-3-8-flash',
  agentName: null,
  instructions: null,
};

export function resolveConfig(config?: Partial<TrueForgeConfig>): TrueForgeConfig {
  return {
    baseUrl: (config?.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    model: config?.model !== undefined ? config.model : DEFAULT_CONFIG.model,
    agentName: config?.agentName !== undefined ? config.agentName : DEFAULT_CONFIG.agentName,
    instructions: config?.instructions !== undefined ? config.instructions : DEFAULT_CONFIG.instructions,
  };
}

/**
 * Creates a new agent session on TrueForge.
 * POST /api/v1/sessions
 * Returns the unique session ID.
 */
export async function createSession(config?: Partial<TrueForgeConfig>): Promise<string> {
  const cfg = resolveConfig(config);
  const url = `${cfg.baseUrl}/api/v1/sessions`;

  let agentPayload: CreateSessionAgentSpec | CreateSessionAgentRef;
  if (cfg.agentName) {
    agentPayload = { name: cfg.agentName };
  } else {
    agentPayload = {
      spec: {
        model: {
          name: cfg.model || 'google-gemini/gemini-3-8-flash',
        },
        ...(cfg.instructions ? { instructions: cfg.instructions } : {}),
      },
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      agent: agentPayload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let message = `TrueForge session creation failed (${response.status} ${response.statusText})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      if (errorText) {
        message += `: ${errorText}`;
      }
    }
    throw new Error(message);
  }

  const json = (await response.json()) as GetSessionResponse;
  if (!json?.data?.id) {
    throw new Error('TrueForge returned invalid response: missing data.id');
  }

  return json.data.id;
}

/**
 * Sends a user message as a turn and streams live events via Server-Sent Events (SSE).
 * POST /api/v1/sessions/{session_id}/turns
 * Returns an EventStream which is an AsyncIterable and EventEmitter.
 */
export async function sendTurn(
  sessionId: string,
  text: string,
  config?: Partial<TrueForgeConfig>,
  onEvent?: TurnEventCallback
): Promise<EventStream> {
  const cfg = resolveConfig(config);
  const url = `${cfg.baseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}/turns`;

  const abortController = new AbortController();
  const eventStream = new EventStream(abortController);

  if (onEvent) {
    eventStream.on('*', onEvent);
  }

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          input: [
            {
              type: 'user.message',
              content: text,
            },
          ],
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let message = `TrueForge turn execution failed (${response.status} ${response.statusText})`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed?.error?.message) {
            message = parsed.error.message;
          }
        } catch {
          if (errorText) {
            message += `: ${errorText}`;
          }
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error('No response body returned from TrueForge turn stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) {
            // Empty boundary or SSE comment
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const event = JSON.parse(dataStr) as TurnStreamingEvent;
              eventStream.push(event);
            } catch (err) {
              console.warn('Could not parse SSE event data:', dataStr, err);
            }
          }
        }
      }

      // Check trailing buffer
      if (buffer.trim().startsWith('data:')) {
        try {
          const event = JSON.parse(buffer.trim().slice(5).trim()) as TurnStreamingEvent;
          eventStream.push(event);
        } catch {
          // ignore trailing incomplete chunk
        }
      }

      eventStream.finish();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        eventStream.finish();
      } else {
        eventStream.fail(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return eventStream;
}

/**
 * Cancels a running turn in a session.
 * POST /api/v1/sessions/{session_id}/cancel
 */
export async function cancel(sessionId: string, config?: Partial<TrueForgeConfig>): Promise<void> {
  const cfg = resolveConfig(config);
  const url = `${cfg.baseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}/cancel`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => '');
      console.warn(`TrueForge cancel returned status ${response.status}: ${text}`);
    }
  } catch (err) {
    console.warn('Failed to call TrueForge cancel endpoint:', err);
  }
}

/**
 * State-preserving client class wrapper around TrueForge endpoints.
 */
export class TrueForgeClient {
  private config: TrueForgeConfig;
  private currentSessionId: string | null = null;
  private activeStream: EventStream | null = null;

  constructor(config?: Partial<TrueForgeConfig>) {
    this.config = resolveConfig(config);
  }

  public getConfig(): TrueForgeConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<TrueForgeConfig>): void {
    this.config = resolveConfig({ ...this.config, ...config });
  }

  public getSessionId(): string | null {
    return this.currentSessionId;
  }

  public setSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  public async createSession(customConfig?: Partial<TrueForgeConfig>): Promise<string> {
    const id = await createSession(customConfig || this.config);
    this.currentSessionId = id;
    return id;
  }

  public async sendTurn(text: string, onEvent?: TurnEventCallback): Promise<EventStream> {
    if (!this.currentSessionId) {
      await this.createSession();
    }

    const stream = await sendTurn(this.currentSessionId!, text, this.config, onEvent);
    this.activeStream = stream;
    return stream;
  }

  public async cancel(): Promise<void> {
    if (this.activeStream) {
      this.activeStream.cancel();
      this.activeStream = null;
    }
    if (this.currentSessionId) {
      await cancel(this.currentSessionId, this.config);
    }
  }
}
