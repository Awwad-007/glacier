const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      window: { registerWebviewViewProvider: () => {} },
      commands: { registerCommand: () => {} },
      workspace: { getConfiguration: () => ({ get: () => undefined }) }
    };
  }
  return origRequire.apply(this, arguments);
};

const http = require('node:http');
const assert = require('node:assert');
const test = require('node:test');
const { sendTurn, DEFAULT_CONFIG } = require('../dist/extension.js');

test('DEFAULT_CONFIG idleTimeoutMs defaults to 120000', () => {
  assert.strictEqual(DEFAULT_CONFIG.idleTimeoutMs, 120000);
});

test('sendTurn idle timeout fails stream when no data received within timeout', async () => {
  let clientRes;
  const server = http.createServer((req, res) => {
    req.resume();
    clientRes = res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders();
    // Deliberately do not write any data to simulate hanging stream
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const stream = await sendTurn('dummy-session', 'hello', {
      baseUrl,
      idleTimeoutMs: 150, // fast timeout for test
    });

    await assert.rejects(
      async () => {
        for await (const _ of stream) {
          // Should not reach here
        }
      },
      (err) => {
        assert.match(err.message, /TrueForge stream timed out: no data received/);
        return true;
      }
    );
  } finally {
    if (clientRes) {
      clientRes.end();
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close();
  }
});
