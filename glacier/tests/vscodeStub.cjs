globalThis.__vscodeSettings = globalThis.__vscodeSettings || {
  baseUrl: 'http://127.0.0.1:8790',
  model: 'google-gemini/gemini-3-8-flash',
  agentName: null,
  idleTimeoutMs: 120000,
};

function setSettings(settings) {
  globalThis.__vscodeSettings = { ...globalThis.__vscodeSettings, ...settings };
}

const workspace = {
  getConfiguration: (section) => ({
    get: (key, defaultValue) => {
      const currentSettings = globalThis.__vscodeSettings;
      if (currentSettings && currentSettings[key] !== undefined) {
        return currentSettings[key];
      }
      return defaultValue;
    },
  }),
  workspaceFolders: [],
};

const Uri = {
  file: (fpath) => ({ fsPath: fpath, path: fpath, toString: () => fpath }),
  parse: (str) => ({ fsPath: str, path: str, toString: () => str }),
  joinPath: (base, ...segments) => {
    const p = [base.fsPath || base.path, ...segments].join('/');
    return { fsPath: p, path: p, toString: () => p };
  },
};

const window = {
  registerWebviewViewProvider: () => ({ dispose: () => {} }),
  showInformationMessage: () => {},
  showErrorMessage: () => {},
};

const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => {},
};

module.exports = {
  workspace,
  Uri,
  window,
  commands,
  setSettings,
};
