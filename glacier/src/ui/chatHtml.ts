import * as vscode from 'vscode';
import { TrueForgeConfig } from '../trueforge/types';

export function getChatHtml(
  webview: vscode.Webview,
  _extensionUri: vscode.Uri,
  config: TrueForgeConfig,
  configSource: string
): string {
  const nonce = getNonce();
  const modelDisplay = config.agentName ? `Agent: ${config.agentName}` : (config.model || 'Default Model');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glacier Chat</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover: var(--vscode-button-hoverBackground);
      --secondary-button-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --secondary-button-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --border-color: var(--vscode-panel-border, #2b2b2b);
      --code-bg: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12));
      --error-fg: var(--vscode-errorForeground, #f48771);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Bar */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #388a34;
      display: inline-block;
    }

    .model-tag {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--fg);
      opacity: 0.8;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .icon-btn:hover {
      opacity: 1;
      background: var(--input-bg);
    }

    /* Messages Area */
    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .welcome-container {
      margin: auto 0;
      text-align: center;
      padding: 20px 10px;
      opacity: 0.85;
    }

    .welcome-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .welcome-sub {
      font-size: 12px;
      opacity: 0.75;
      margin-bottom: 16px;
      max-width: 280px;
      margin-left: auto;
      margin-right: auto;
    }

    .quick-prompts {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 280px;
      margin: 0 auto;
    }

    .quick-chip {
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      color: var(--fg);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }

    .quick-chip:hover {
      border-color: var(--button-bg);
    }

    /* Message Bubbles */
    .message-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .message-user {
      align-self: flex-end;
      max-width: 90%;
    }

    .message-user .bubble {
      background: var(--button-bg);
      color: var(--button-fg);
      border-radius: 8px 8px 2px 8px;
      padding: 8px 12px;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .message-assistant {
      align-self: flex-start;
      width: 100%;
    }

    .message-assistant .author-label {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.7;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .message-assistant .bubble {
      background: transparent;
      padding: 4px 0;
      word-break: break-word;
    }

    /* Markdown Styling */
    .bubble p {
      margin-bottom: 8px;
    }

    .bubble p:last-child {
      margin-bottom: 0;
    }

    .bubble code {
      background: var(--code-bg);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }

    .bubble pre {
      background: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0;
      overflow-x: auto;
      position: relative;
    }

    .bubble pre code {
      background: transparent;
      padding: 0;
      border: none;
      display: block;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }

    .copy-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      color: var(--fg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0.7;
    }

    .copy-btn:hover {
      opacity: 1;
    }

    .bubble ul, .bubble ol {
      padding-left: 20px;
      margin-bottom: 8px;
    }

    .bubble li {
      margin-bottom: 4px;
    }

    .bubble h1, .bubble h2, .bubble h3 {
      margin: 10px 0 6px 0;
      font-weight: 600;
    }

    .bubble h1 { font-size: 15px; }
    .bubble h2 { font-size: 14px; }
    .bubble h3 { font-size: 13px; }

    /* Cursor */
    .typing-cursor {
      display: inline-block;
      width: 7px;
      height: 14px;
      background-color: var(--fg);
      vertical-align: middle;
      margin-left: 2px;
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    /* Error Box */
    .error-banner {
      background: rgba(244, 135, 113, 0.12);
      border: 1px solid var(--error-fg);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--error-fg);
      font-size: 12px;
      margin: 4px 0;
    }

    /* Input Footer */
    .footer {
      padding: 10px 12px;
      border-top: 1px solid var(--border-color);
      background: var(--bg);
      flex-shrink: 0;
    }

    .input-box {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      background: var(--input-bg);
      padding: 6px 8px;
      transition: border-color 0.15s;
    }

    .input-box:focus-within {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    textarea {
      width: 100%;
      background: transparent;
      border: none;
      outline: none;
      color: var(--input-fg);
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 48px;
      max-height: 140px;
      line-height: 1.4;
    }

    .input-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      padding-top: 4px;
    }

    .tip {
      font-size: 10px;
      opacity: 0.6;
    }

    .action-btn {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .action-btn:hover {
      background: var(--button-hover);
    }

    .action-btn.cancel-btn {
      background: var(--secondary-button-bg);
      color: var(--secondary-button-fg);
    }

    .action-btn.cancel-btn:hover {
      background: #4a4d52;
    }

    .session-info {
      font-size: 10px;
      opacity: 0.5;
      margin-top: 4px;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo-badge">
        <span class="status-dot" id="statusDot"></span>
        <span>Glacier</span>
      </div>
      <span class="model-tag" id="modelTag" title="${escapeHtml(modelDisplay)} (${escapeHtml(configSource)})">${escapeHtml(modelDisplay)}</span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="newSessionBtn" title="Start a new chat session">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
        </svg>
        <span>New</span>
      </button>
    </div>
  </div>

  <div class="messages-container" id="messagesContainer">
    <div class="welcome-container" id="welcomeContainer">
      <div class="welcome-title">Glacier AI Assistant</div>
      <div class="welcome-sub">Powered by TrueForge agent harness at <code>${escapeHtml(config.baseUrl)}</code>.</div>
      <div class="quick-prompts">
        <button class="quick-chip" nonce="${nonce}" data-prompt="What files are in this project and what does it do?">What files are in this project?</button>
        <button class="quick-chip" nonce="${nonce}" data-prompt="Say hello and tell me what model you are running on.">Say hello & show model</button>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="input-box">
      <textarea id="promptInput" placeholder="Type a message... (Enter to send, Shift+Enter for newline)"></textarea>
      <div class="input-toolbar">
        <span class="tip">Enter ↵ to send</span>
        <button class="action-btn" id="sendBtn">Send</button>
      </div>
    </div>
    <div class="session-info" id="sessionInfo">Session: idle</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeContainer = document.getElementById('welcomeContainer');
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const newSessionBtn = document.getElementById('newSessionBtn');
    const sessionInfo = document.getElementById('sessionInfo');
    const statusDot = document.getElementById('statusDot');
    const modelTag = document.getElementById('modelTag');

    let isGenerating = false;
    let currentAssistantBubble = null;
    let currentAssistantRawText = '';
    let currentCursor = null;

    // Load persisted state
    const previousState = vscode.getState();
    if (previousState && Array.isArray(previousState.messages) && previousState.messages.length > 0) {
      welcomeContainer.style.display = 'none';
      previousState.messages.forEach(m => renderMessage(m.role, m.text));
      if (previousState.sessionId) {
        sessionInfo.textContent = 'Session: ' + previousState.sessionId.slice(-8);
      }
    }

    // Auto-resize input
    promptInput.addEventListener('input', () => {
      promptInput.style.height = 'auto';
      promptInput.style.height = Math.min(promptInput.scrollHeight, 140) + 'px';
    });

    // Keyboard enter handling
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    });

    sendBtn.addEventListener('click', () => {
      if (isGenerating) {
        vscode.postMessage({ command: 'cancel' });
      } else {
        handleSubmit();
      }
    });

    newSessionBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'newSession' });
    });

    // Quick prompt buttons
    document.querySelectorAll('.quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) {
          promptInput.value = prompt;
          handleSubmit();
        }
      });
    });

    function handleSubmit() {
      const text = promptInput.value.trim();
      if (!text || isGenerating) return;

      welcomeContainer.style.display = 'none';
      renderMessage('user', text);
      promptInput.value = '';
      promptInput.style.height = 'auto';

      startAssistantMessage();

      setGenerating(true);
      vscode.postMessage({ command: 'sendMessage', text: text });
      saveState();
    }

    let renderRafId = null;

    function scheduleRenderAssistant() {
      if (renderRafId !== null) return;
      renderRafId = requestAnimationFrame(() => {
        renderRafId = null;
        if (currentAssistantBubble) {
          renderMarkdown(currentAssistantBubble, currentAssistantRawText);
          if (currentCursor) {
            currentAssistantBubble.appendChild(currentCursor);
          }
          scrollToBottom();
        }
      });
    }

    function flushRenderAssistant() {
      if (renderRafId !== null) {
        cancelAnimationFrame(renderRafId);
        renderRafId = null;
      }
      if (currentAssistantBubble) {
        renderMarkdown(currentAssistantBubble, currentAssistantRawText);
        if (currentCursor) {
          currentAssistantBubble.appendChild(currentCursor);
        }
        scrollToBottom();
      }
    }

    function setGenerating(generating) {
      isGenerating = generating;
      if (generating) {
        sendBtn.textContent = 'Cancel';
        sendBtn.classList.add('cancel-btn');
        statusDot.style.backgroundColor = '#e5a50a'; // yellow/busy
      } else {
        flushRenderAssistant();
        sendBtn.textContent = 'Send';
        sendBtn.classList.remove('cancel-btn');
        statusDot.style.backgroundColor = '#388a34'; // green/idle
        removeCursor();
        saveState();
      }
    }

    function startAssistantMessage() {
      currentAssistantRawText = '';

      const row = document.createElement('div');
      row.className = 'message-row message-assistant';

      const author = document.createElement('div');
      author.className = 'author-label';
      author.innerHTML = '<span>Glacier</span>';
      row.appendChild(author);

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      row.appendChild(bubble);

      currentAssistantBubble = bubble;
      currentCursor = document.createElement('span');
      currentCursor.className = 'typing-cursor';
      bubble.appendChild(currentCursor);

      messagesContainer.appendChild(row);
      scrollToBottom();
    }

    function appendDelta(delta) {
      if (!currentAssistantBubble) {
        startAssistantMessage();
      }
      currentAssistantRawText += delta;
      scheduleRenderAssistant();
    }

    function removeCursor() {
      if (currentCursor && currentCursor.parentNode) {
        currentCursor.parentNode.removeChild(currentCursor);
      }
      currentCursor = null;
    }

    function renderMessage(role, text) {
      const row = document.createElement('div');
      row.className = 'message-row ' + (role === 'user' ? 'message-user' : 'message-assistant');

      if (role === 'assistant') {
        const author = document.createElement('div');
        author.className = 'author-label';
        author.textContent = 'Glacier';
        row.appendChild(author);
      }

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (role === 'user') {
        bubble.textContent = text;
      } else {
        renderMarkdown(bubble, text);
      }
      row.appendChild(bubble);

      messagesContainer.appendChild(row);
      scrollToBottom();
    }

    function showError(errorMessage) {
      const banner = document.createElement('div');
      banner.className = 'error-banner';
      banner.textContent = errorMessage;
      messagesContainer.appendChild(banner);
      scrollToBottom();
    }

    function scrollToBottom() {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Markdown renderer
    function renderMarkdown(container, raw) {
      // Escape HTML
      let html = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks
      html = html.replace(new RegExp('\\x60\\x60\\x60([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)\\x60\\x60\\x60', 'g'), function(match, lang, code) {
        return '<pre><button class="copy-btn" type="button">Copy</button><code>' + code + '</code></pre>';
      });

      // Inline code
      html = html.replace(new RegExp('\\x60([^\\x60\\n]+)\\x60', 'g'), '<code>$1</code>');

      // Bold **text**
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Italic *text*
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // Headings ###
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // Unordered lists - item
      html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
      html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');

      // Line breaks
      html = html.replace(/\n\n/g, '<p></p>');
      html = html.replace(/\n/g, '<br/>');

      container.innerHTML = html;
    }

    // Event delegation for copy buttons (respecting CSP nonce)
    messagesContainer.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('copy-btn')) {
        const codeBlock = target.parentElement ? target.parentElement.querySelector('code') : null;
        if (codeBlock) {
          navigator.clipboard.writeText(codeBlock.innerText).then(() => {
            target.textContent = 'Copied!';
            setTimeout(() => { target.textContent = 'Copy'; }, 1500);
          }).catch((err) => {
            console.error('Failed to copy code block:', err);
          });
        }
      }
    });

    function saveState() {
      const bubbles = messagesContainer.querySelectorAll('.message-row');
      const messages = [];
      bubbles.forEach(b => {
        const isUser = b.classList.contains('message-user');
        const text = isUser ? b.querySelector('.bubble').textContent : b.querySelector('.bubble').innerText;
        messages.push({ role: isUser ? 'user' : 'assistant', text: text });
      });
      const curState = vscode.getState() || {};
      vscode.setState({ ...curState, messages: messages });
    }

    // Message events from extension host
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'sessionActive':
          if (msg.sessionId) {
            sessionInfo.textContent = 'Session: ' + msg.sessionId.slice(-8);
            const curState = vscode.getState() || {};
            vscode.setState({ ...curState, sessionId: msg.sessionId });
          }
          break;
        case 'delta':
          if (msg.content) {
            appendDelta(msg.content);
          }
          break;
        case 'turnDone':
          setGenerating(false);
          currentAssistantBubble = null;
          break;
        case 'turnCancelled':
          setGenerating(false);
          if (currentAssistantBubble) {
            const notice = document.createElement('div');
            notice.style.fontSize = '11px';
            notice.style.opacity = '0.6';
            notice.style.marginTop = '4px';
            notice.textContent = '(Turn cancelled)';
            currentAssistantBubble.appendChild(notice);
          }
          currentAssistantBubble = null;
          break;
        case 'turnError':
          setGenerating(false);
          showError(msg.message || 'An error occurred during turn execution');
          currentAssistantBubble = null;
          break;
        case 'resetSession':
          messagesContainer.innerHTML = '';
          welcomeContainer.style.display = 'block';
          messagesContainer.appendChild(welcomeContainer);
          sessionInfo.textContent = 'Session: idle';
          setGenerating(false);
          currentAssistantBubble = null;
          vscode.setState({ messages: [], sessionId: null });
          break;
        case 'updateConfig':
          if (msg.model) {
            modelTag.textContent = msg.model;
            modelTag.title = msg.model;
          }
          break;
      }
    });

    // Inform extension webview is ready
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
