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

const assert = require('node:assert');
const test = require('node:test');
const { EventStream } = require('../dist/extension.js');

test('EventStream.fail() rejects waiting consumer with the error', async () => {
  const abortController = new AbortController();
  const stream = new EventStream(abortController);

  const testError = new Error('Connection broke unexpectedly');

  // Start waiting on next() while stream is empty
  const nextPromise = stream[Symbol.asyncIterator]().next();

  // Trigger failure
  stream.fail(testError);

  // The waiting consumer must reject with testError
  await assert.rejects(
    async () => {
      await nextPromise;
    },
    (err) => {
      assert.strictEqual(err, testError);
      assert.strictEqual(err.message, 'Connection broke unexpectedly');
      return true;
    }
  );
});

test('EventStream.fail() rejects subsequent consumer calls', async () => {
  const abortController = new AbortController();
  const stream = new EventStream(abortController);

  const testError = new Error('Premature failure');
  stream.fail(testError);

  await assert.rejects(
    async () => {
      await stream[Symbol.asyncIterator]().next();
    },
    (err) => {
      assert.strictEqual(err, testError);
      return true;
    }
  );
});
