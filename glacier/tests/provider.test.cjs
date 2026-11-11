const http = require('node:http');
const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const esbuild = require('esbuild');

// 1. Bundle ChatViewProvider with esbuild using alias vscode -> vscodeStub.cjs
const stubPath = path.resolve(__dirname, 'vscodeStub.cjs');
const bundlePath = path.resolve(__dirname, '../dist/chatViewProvider.test-bundle.cjs');

esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui/chatViewProvider.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundlePath,
  alias: {
    vscode: stubPath,
  },
  logLevel: 'silent',
});

const { ChatViewProvider } = require(bundlePath);
const vscodeStub = require(stubPath);

/**
 * Helper to spin up a mock server, mock WebviewView, and mount ChatViewProvider.
 */
async function createHarness(handler) {
  const postedMessages = [];
  let receiveMessageCallback = null;

  const server = http.createServer((req, res) => {
    req.resume();
    handler(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  vscodeStub.setSettings({ baseUrl, model: 'google-gemini/gemini-3-8-flash' });

  const mockWebview = {
    options: {},
    html: '',
    onDidReceiveMessage: (cb) => {
      receiveMessageCallback = cb;
    },
    postMessage: async (msg) => {
      postedMessages.push(msg);
    },
  };

  const mockWebviewView = { webview: mockWebview };
  const provider = new ChatViewProvider(vscodeStub.Uri.file('/fake/path'));
  await provider.resolveWebviewView(mockWebviewView, {}, {});

  return {
    server,
    baseUrl,
    postedMessages,
    sendMessage: async (text) => {
      if (receiveMessageCallback) {
        await receiveMessageCallback({ command: 'sendMessage', text });
      }
    },
    cancelTurn: async () => {
      if (receiveMessageCallback) {
        await receiveMessageCallback({ command: 'cancel' });
      }
    },
    newSession: async () => {
      if (receiveMessageCallback) {
        await receiveMessageCallback({ command: 'newSession' });
      }
    },
    provider,
    close: () => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close();
    },
  };
}

test('Provider: normal turn', async () => {
  const harness = await createHarness((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'sess-normal' } }));
      return;
    }
    if (req.method === 'POST' && req.url.includes('/turns')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
      });
      res.flushHeaders();
      res.write('data: {"type":"turn.created","id":"t1","turn_id":"t1","state":{"status":"running"}}\n\n');
      res.write('data: {"type":"model.message.delta","content":"Hello "}\n\n');
      res.write('data: {"type":"model.message.delta","content":"world!"}\n\n');
      res.write('data: {"type":"turn.done","id":"t2","state":{"status":"done"}}\n\n');
      res.end();
      return;
    }
  });

  try {
    await harness.sendMessage('Hi');
    assert.deepStrictEqual(harness.postedMessages, [
      { type: 'sessionActive', sessionId: 'sess-normal' },
      { type: 'delta', content: 'Hello ' },
      { type: 'delta', content: 'world!' },
      { type: 'turnDone' },
    ]);
  } finally {
    harness.close();
  }
});

test('Provider: HTTP 500 on turns', async () => {
  const harness = await createHarness((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'sess-500' } }));
      return;
    }
    if (req.method === 'POST' && req.url.includes('/turns')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Internal Server Error' } }));
      return;
    }
  });

  try {
    await harness.sendMessage('Trigger error');
    assert.strictEqual(harness.postedMessages.length, 2);
    assert.strictEqual(harness.postedMessages[0].type, 'sessionActive');
    assert.strictEqual(harness.postedMessages[0].sessionId, 'sess-500');
    assert.strictEqual(harness.postedMessages[1].type, 'turnError');
    assert.match(harness.postedMessages[1].message, /500|Internal Server Error/);
  } finally {
    harness.close();
  }
});

test('Provider: stream closing without turn.done', async () => {
  const harness = await createHarness((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'sess-premature' } }));
      return;
    }
    if (req.method === 'POST' && req.url.includes('/turns')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
      });
      res.flushHeaders();
      res.write('data: {"type":"model.message.delta","content":"partial text"}\n\n');
      res.end(); // close without turn.done
      return;
    }
  });

  try {
    await harness.sendMessage('Will close abruptly');
    assert.deepStrictEqual(harness.postedMessages, [
      { type: 'sessionActive', sessionId: 'sess-premature' },
      { type: 'delta', content: 'partial text' },
      { type: 'turnError', message: 'Connection to TrueForge closed unexpectedly' },
    ]);
  } finally {
    harness.close();
  }
});

test('Provider: user cancel mid-stream', async () => {
  let activeRes = null;

  const harness = await createHarness((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'sess-cancel' } }));
      return;
    }
    if (req.method === 'POST' && req.url.includes('/cancel')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    if (req.method === 'POST' && req.url.includes('/turns')) {
      activeRes = res;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.flushHeaders();
      res.write('data: {"type":"model.message.delta","content":"streaming delta"}\n\n');
      return;
    }
  });

  try {
    const sendPromise = harness.sendMessage('Please cancel');
    // Allow the delta to arrive
    await new Promise((r) => setTimeout(r, 60));

    // Cancel mid-stream
    await harness.cancelTurn();
    await sendPromise;

    assert.deepStrictEqual(harness.postedMessages, [
      { type: 'sessionActive', sessionId: 'sess-cancel' },
      { type: 'delta', content: 'streaming delta' },
      { type: 'turnCancelled' },
    ]);
  } finally {
    if (activeRes) {
      activeRes.end();
    }
    harness.close();
  }
});

test('Provider: new session mid-stream', async () => {
  let activeRes = null;

  const harness = await createHarness((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/sessions') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'sess-new' } }));
      return;
    }
    if (req.method === 'POST' && req.url.includes('/cancel')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    if (req.method === 'POST' && req.url.includes('/turns')) {
      activeRes = res;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.flushHeaders();
      res.write('data: {"type":"model.message.delta","content":"partial before new"}\n\n');
      return;
    }
  });

  try {
    const sendPromise = harness.sendMessage('Please reset');
    // Allow the delta to arrive
    await new Promise((r) => setTimeout(r, 60));

    // Trigger new session mid-stream
    await harness.newSession();
    await sendPromise;

    assert.deepStrictEqual(harness.postedMessages, [
      { type: 'sessionActive', sessionId: 'sess-new' },
      { type: 'delta', content: 'partial before new' },
      { type: 'resetSession' },
    ]);
  } finally {
    if (activeRes) {
      activeRes.end();
    }
    harness.close();
  }
});
