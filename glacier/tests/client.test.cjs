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
const { createSession, sendTurn, cancel } = require('../dist/extension.js');

test('Scenario 1: HTTP 500 on turns fails with appropriate error', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Internal Model Failure' } }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const stream = await sendTurn('session-500', 'hello', { baseUrl });
    await assert.rejects(
      async () => {
        for await (const _ of stream) {}
      },
      (err) => {
        assert.match(err.message, /Internal Model Failure|500/);
        return true;
      }
    );
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close();
  }
});

test('Scenario 2: Stream closing without turn.done delivers events then ends cleanly without turn.done', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
    });
    res.flushHeaders();
    res.write('data: {"type":"turn.created","id":"1","turn_id":"t1","state":{"status":"running"}}\n\n');
    res.write('data: {"type":"model.message.delta","content":"partial text"}\n\n');
    // Abruptly close without emitting turn.done
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const receivedEvents = [];
    const stream = await sendTurn('session-premature', 'hello', { baseUrl });
    for await (const event of stream) {
      receivedEvents.push(event);
    }
    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(receivedEvents[0].type, 'turn.created');
    assert.strictEqual(receivedEvents[1].type, 'model.message.delta');
    const hasTurnDone = receivedEvents.some((e) => e.type === 'turn.done');
    assert.strictEqual(hasTurnDone, false, 'Stream closed without emitting turn.done');
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close();
  }
});

test('Scenario 3: Mid-stream cancel aborts stream and calls cancel endpoint', async () => {
  let cancelEndpointCalled = false;
  let activeRes;

  const server = http.createServer((req, res) => {
    req.resume();
    if (req.url && req.url.includes('/cancel')) {
      cancelEndpointCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }

    activeRes = res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders();
    res.write('data: {"type":"model.message.delta","content":"part 1"}\n\n');
    // Keep connection open until cancelled
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const stream = await sendTurn('session-cancel', 'hello', { baseUrl });
    for await (const event of stream) {
      if (event.type === 'model.message.delta') {
        // Trigger cancel mid-stream
        stream.cancel();
        await cancel('session-cancel', { baseUrl });
        break;
      }
    }
    assert.strictEqual(cancelEndpointCalled, true, 'Cancel endpoint was invoked');
  } finally {
    if (activeRes) {
      activeRes.end();
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close();
  }
});

test('Scenario 4: Server down fails gracefully with connection error', async () => {
  // Use a port that is not listening
  const deadBaseUrl = 'http://127.0.0.1:54321';

  const stream = await sendTurn('session-dead', 'hello', { baseUrl: deadBaseUrl });
  await assert.rejects(
    async () => {
      for await (const _ of stream) {}
    },
    (err) => {
      assert.match(err.message, /fetch failed|ECONNREFUSED|EACCES/);
      return true;
    }
  );
});
