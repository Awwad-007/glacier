import * as vscode from 'vscode';
import { loadConfig } from '../config/config';
import { TrueForgeClient } from '../trueforge/client';
import { TurnStreamingEvent } from '../trueforge/types';
import { getChatHtml } from './chatHtml';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'glacier.chatView';

  private view?: vscode.WebviewView;
  private client: TrueForgeClient;
  private stoppedByUser = false;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.client = new TrueForgeClient();
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const { config, source } = await loadConfig();
    this.client.updateConfig(config);

    webviewView.webview.html = getChatHtml(webviewView.webview, this.extensionUri, config, source);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'ready': {
          const sid = this.client.getSessionId();
          if (sid) {
            this.view?.webview.postMessage({ type: 'sessionActive', sessionId: sid });
          }
          break;
        }

        case 'sendMessage': {
          await this.handleUserMessage(message.text);
          break;
        }

        case 'cancel': {
          await this.handleCancel();
          break;
        }

        case 'newSession': {
          await this.newSession();
          break;
        }
      }
    });
  }

  private async handleUserMessage(text: string): Promise<void> {
    this.stoppedByUser = false;
    try {
      // Reload config before sending in case VS Code settings changed
      const { config } = await loadConfig();
      this.client.updateConfig(config);

      // Ensure session exists
      if (!this.client.getSessionId()) {
        try {
          const sessionId = await this.client.createSession();
          this.view?.webview.postMessage({ type: 'sessionActive', sessionId });
        } catch (createErr: any) {
          const msg = createErr?.message || String(createErr);
          this.view?.webview.postMessage({
            type: 'turnError',
            message: `Could not connect to TrueForge at ${this.client.getConfig().baseUrl}. Please ensure TrueForge is running. (${msg})`,
          });
          return;
        }
      }

      let receivedDeltas = false;
      let receivedTurnDone = false;

      const stream = await this.client.sendTurn(text, (event: TurnStreamingEvent) => {
        if (event.type === 'model.message.delta') {
          const deltaEvent = event as { content?: string | null };
          if (deltaEvent.content) {
            receivedDeltas = true;
            this.view?.webview.postMessage({
              type: 'delta',
              content: deltaEvent.content,
            });
          }
        } else if (event.type === 'model.message' && !receivedDeltas) {
          const msgEvent = event as { content?: string | null };
          if (typeof msgEvent.content === 'string' && msgEvent.content.length > 0) {
            this.view?.webview.postMessage({
              type: 'delta',
              content: msgEvent.content,
            });
          }
        } else if (event.type === 'turn.done') {
          receivedTurnDone = true;
          const doneEvent = event as { state?: { status: string; message?: string } };
          const status = doneEvent.state?.status;
          if (status === 'error') {
            this.view?.webview.postMessage({
              type: 'turnError',
              message: doneEvent.state?.message || 'Turn finished with error status.',
            });
          } else if (status === 'cancelled') {
            this.view?.webview.postMessage({ type: 'turnCancelled' });
          } else {
            this.view?.webview.postMessage({ type: 'turnDone' });
          }
        }
      });

      // Also consume async iterator to ensure completion / error propagation
      for await (const _ of stream) {
        // Events are handled in real-time by the event callback
      }

      if (!receivedTurnDone && !this.stoppedByUser) {
        this.view?.webview.postMessage({
          type: 'turnError',
          message: 'Connection to TrueForge closed unexpectedly',
        });
      }
    } catch (err: any) {
      if (this.stoppedByUser) {
        // Handled by handleCancel() or newSession()
      } else if (err.name === 'AbortError') {
        this.view?.webview.postMessage({ type: 'turnCancelled' });
      } else {
        const msg = err?.message || String(err);
        this.view?.webview.postMessage({
          type: 'turnError',
          message: `Turn error: ${msg}`,
        });
      }
    }
  }

  private async handleCancel(): Promise<void> {
    this.stoppedByUser = true;
    try {
      await this.client.cancel();
      this.view?.webview.postMessage({ type: 'turnCancelled' });
    } catch (err) {
      console.error('Failed to cancel turn:', err);
    }
  }

  public async newSession(): Promise<void> {
    this.stoppedByUser = true;
    try {
      await this.client.newSession();
    } catch (err) {
      console.warn('Failed to cancel session during newSession:', err);
      this.client.setSessionId(null);
    }
    this.view?.webview.postMessage({ type: 'resetSession' });
  }
}
