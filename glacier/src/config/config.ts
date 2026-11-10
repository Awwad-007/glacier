import * as vscode from 'vscode';
import { DEFAULT_CONFIG, resolveConfig } from '../trueforge/client';
import { TrueForgeConfig } from '../trueforge/types';

export interface LoadedConfigResult {
  config: TrueForgeConfig;
  source: string;
}

/**
 * Loads TrueForge configuration from trueforge.config.json in the open workspace,
 * falling back to VS Code user/workspace settings or system defaults.
 */
export async function loadConfig(): Promise<LoadedConfigResult> {
  const folders = vscode.workspace.workspaceFolders;

  if (folders && folders.length > 0) {
    for (const folder of folders) {
      const configUri = vscode.Uri.joinPath(folder.uri, 'trueforge.config.json');
      try {
        const fileBytes = await vscode.workspace.fs.readFile(configUri);
        const text = new TextDecoder('utf-8').decode(fileBytes);
        const parsed = JSON.parse(text);

        const config = resolveConfig({
          baseUrl: parsed.baseUrl,
          model: parsed.model,
          agentName: parsed.agentName,
          instructions: parsed.instructions,
        });

        return {
          config,
          source: configUri.fsPath || configUri.path,
        };
      } catch {
        // File does not exist or unparseable in this folder; check next
      }
    }
  }

  // Fallback: check VS Code workspace configuration ('glacier')
  const vscConfig = vscode.workspace.getConfiguration('glacier');
  const baseUrl = vscConfig.get<string>('baseUrl') || DEFAULT_CONFIG.baseUrl;
  const model = vscConfig.get<string>('model') || DEFAULT_CONFIG.model;
  const agentName = vscConfig.get<string | null>('agentName') || DEFAULT_CONFIG.agentName;

  return {
    config: resolveConfig({
      baseUrl,
      model,
      agentName,
    }),
    source: 'VS Code Settings / Defaults',
  };
}
