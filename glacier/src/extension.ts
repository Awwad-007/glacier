import * as vscode from 'vscode';
import { ChatViewProvider } from './ui/chatViewProvider';

export * from './trueforge';
export * from './ui';
export * from './config/config';

export function activate(context: vscode.ExtensionContext) {
  console.log('Glacier extension is activating...');

  const chatProvider = new ChatViewProvider(context.extensionUri);

  // Register Webview View Provider for the Glacier Chat panel
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // Command to open / focus Glacier Chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('glacier.openChat', async () => {
      await vscode.commands.executeCommand('glacier.chatView.focus');
    })
  );

  // Command to start a new chat session
  context.subscriptions.push(
    vscode.commands.registerCommand('glacier.newSession', async () => {
      await chatProvider.newSession();
      vscode.window.showInformationMessage('Glacier: New chat session started.');
    })
  );

  console.log('Glacier extension is now active.');
}

export function deactivate() {}
