import * as vscode from 'vscode';
import { DEFAULT_CONFIG, resolveConfig } from '../trueforge/client';
import { TrueForgeConfig } from '../trueforge/types';

export interface LoadedConfigResult {
  config: TrueForgeConfig;
  source: string;
}

/**
 * Loads TrueForge configuration from VS Code glacier.* settings,
 * falling back to system defaults.
 *
 * Note: trueforge.config.example.json is kept as documentation only.
 */
export async function loadConfig(): Promise<LoadedConfigResult> {
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
    source: 'VS Code Settings',
  };
}
