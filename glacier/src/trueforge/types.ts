/**
 * TrueForge client configuration.
 */
export interface TrueForgeConfig {
  /**
   * Base URL of the TrueForge server, e.g. http://localhost:8790
   */
  baseUrl: string;

  /**
   * Model identifier to use when creating inline agent sessions.
   * e.g. "google-gemini/gemini-3-8-flash"
   */
  model?: string | null;

  /**
   * Optional named agent in TrueForge agent registry.
   * If provided, creates a named reference session instead of inline spec.
   */
  agentName?: string | null;

  /**
   * Optional system instructions / role prompt for the agent.
   */
  instructions?: string | null;
}

/**
 * User message item sent in turns.
 */
export interface UserMessageItem {
  type: 'user.message';
  content: string;
}

export type TurnInputItem = UserMessageItem;

/**
 * Inline agent specification.
 */
export interface AgentSpec {
  model: {
    name: string;
    params?: Record<string, unknown>;
  };
  instructions?: string;
  [key: string]: unknown;
}

export interface SessionAgentSpecBody {
  spec: AgentSpec;
}

export type CreateSessionAgentSpec = SessionAgentSpecBody;

export interface SessionAgentNameRef {
  name: string;
}

export type CreateSessionAgentRef = SessionAgentNameRef;

export interface CreateSessionRequest {
  agent: SessionAgentSpecBody | SessionAgentNameRef;
  metadata?: Record<string, unknown>;
}

export interface SessionData {
  id: string;
  agent: Record<string, unknown>;
  title: string | null;
  shared: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface GetSessionResponse {
  data: SessionData;
}

/**
 * Streaming event types emitted by TrueForge turn subscribe / streaming endpoints.
 */
export interface TurnCreatedEvent {
  type: 'turn.created';
  id: string;
  turn_id: string;
  previous_turn_id: string | null;
  input: TurnInputItem[];
  state: {
    status: string;
    [key: string]: unknown;
  };
  created_at: string;
  thread_id: string | null;
  [key: string]: unknown;
}

export interface ModelMessageDeltaEvent {
  type: 'model.message.delta';
  id: string;
  thread_id: string;
  content?: string | null;
  refusal?: string | null;
  reasoning_content?: string;
  finish_reason?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface ModelMessageEvent {
  type: 'model.message';
  id: string;
  thread_id: string;
  content?: string | null | Array<{ type: string; text?: string }>;
  reasoning_content?: string;
  refusal?: string | null;
  finish_reason?: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface TurnDoneState {
  status: 'done' | 'cancelled' | 'error';
  message?: string;
  completed_at?: string;
  metrics?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

export interface TurnDoneEvent {
  type: 'turn.done';
  id: string;
  state: TurnDoneState;
  created_at: string;
  thread_id: string | null;
  [key: string]: unknown;
}

export type TurnStreamingEvent =
  | TurnCreatedEvent
  | ModelMessageDeltaEvent
  | ModelMessageEvent
  | TurnDoneEvent
  | { type: string; [key: string]: unknown };

export type TurnEventCallback = (event: TurnStreamingEvent) => void;
