# Milestone M1 Hardening Changes

This document records the 9 hardening fixes applied to the Glacier VS Code extension.

---

### Fix 1: Reject Waiting Consumers on fail()
- **What Changed**: In `EventStream`, `resolvers` now stores `{ resolve, reject }` tuples instead of resolve-only callbacks. When `fail(err)` is called, all waiting consumer promises reject with the provided `Error`, and subsequent calls to `next()` immediately reject.
- **Files Modified/Created**:
  - `src/trueforge/eventStream.ts`
  - `tests/eventStream.test.cjs`
  - `tsconfig.json`
- **Test Result**: `PASS`
  ```text
  ✔ EventStream.fail() rejects waiting consumer with the error (1.34ms)
  ✔ EventStream.fail() rejects subsequent consumer calls (0.25ms)
  ```

---

### Fix 2: Handle Premature Stream Closure & Ensure Idle State
- **What Changed**: In `ChatViewProvider.handleUserMessage`, added explicit tracking for `turn.done`. If the stream ends without receiving `turn.done`, a `turnError` message ("Connection to TrueForge closed unexpectedly") is posted to the webview. The webview UI is guaranteed to return to idle on every completion path (done, error, abort, premature close).
- **Files Modified**:
  - `src/ui/chatViewProvider.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 3: Cancel Active Stream and Session Endpoint on newSession()
- **What Changed**: `newSession()` now aborts any in-flight SSE stream via `this.client.cancel()` and dispatches `POST /api/v1/sessions/{session_id}/cancel` to TrueForge before clearing the session ID. Added `newSession()` method to `TrueForgeClient`.
- **Files Modified**:
  - `src/trueforge/client.ts`
  - `src/ui/chatViewProvider.ts`
  - `src/extension.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 4: Stream Idle Timeout (30s)
- **What Changed**: Added an idle data timeout in `sendTurn()` (defaults to 30,000 ms, configurable via `idleTimeoutMs`). If no data chunk is received for 30s while the stream is active, the stream fails with `"TrueForge stream timed out: no data received for 30 seconds"` and aborts the reader.
- **Files Modified/Created**:
  - `src/trueforge/client.ts`
  - `src/trueforge/types.ts`
  - `tests/idleTimeout.test.cjs`
- **Test Result**: `PASS`
  ```text
  ✔ sendTurn idle timeout fails stream when no data received within timeout (233.68ms)
  ```

---

### Fix 5: Read Settings Exclusively from VS Code Configuration
- **What Changed**: In `src/config/config.ts`, removed workspace file searching/reading of `trueforge.config.json`. Settings are now read strictly from VS Code `glacier.*` settings (`glacier.baseUrl`, `glacier.model`, `glacier.agentName`), falling back to system defaults. `trueforge.config.example.json` is preserved as documentation only.
- **Files Modified**:
  - `src/config/config.ts`
  - `src/ui/chatViewProvider.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 6: Replace Inline onclick with Event Delegation (CSP Compliance)
- **What Changed**: In `src/ui/chatHtml.ts`, removed inline `onclick="copyCode(this)"` from generated code block buttons to comply with the webview CSP (`script-src 'nonce-...'`). Attached an event delegation listener on `messagesContainer` inside the nonce'd script block.
- **Files Modified**:
  - `src/ui/chatHtml.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 7: Batch renderMarkdown with requestAnimationFrame
- **What Changed**: In `src/ui/chatHtml.ts`, batched `renderMarkdown` updates during live SSE token streaming using `requestAnimationFrame`. Incoming token deltas queue text and render at most once per animation frame, with immediate synchronous flush when generation stops or completes.
- **Files Modified**:
  - `src/ui/chatHtml.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 8: Remove Web Extension Target (Desktop Only)
- **What Changed**: Removed the `"browser"` entry point from `package.json`, uninstalled `@vscode/test-web`, removed browser bundling from `esbuild.js`, removed `src/web/`, and updated launch configurations to target the desktop extension host only.
- **Files Modified/Deleted**:
  - `package.json`
  - `esbuild.js`
  - `tsconfig.json`
  - `.vscode/launch.json`
  - `glacier/.vscode/launch.json`
  - Deleted: `src/web/extension.ts`, `src/web/test/suite/extension.test.ts`, `src/web/test/suite/mochaTestRunner.ts`
- **Test Result**: `PASS` (`npm run compile` succeeded with code 0; clean desktop bundle generated)

---

### Fix 9: Fake SSE Server Test Suite
- **What Changed**: Created `tests/client.test.cjs` covering all 4 failure/edge scenarios: HTTP 500 on turns, stream closing without `turn.done`, mid-stream cancellation, and server down. Added `test:client` npm script in `package.json`.
- **Files Modified/Created**:
  - `tests/client.test.cjs`
  - `package.json`
- **Test Result**: `PASS`
  ```text
  > glacier@0.0.1 test:client
  > node --test tests/client.test.cjs tests/eventStream.test.cjs tests/idleTimeout.test.cjs

  ✔ Scenario 1: HTTP 500 on turns fails with appropriate error (68.49ms)
  ✔ Scenario 2: Stream closing without turn.done delivers events then ends cleanly without turn.done (15.70ms)
  ✔ Scenario 3: Mid-stream cancel aborts stream and calls cancel endpoint (15.42ms)
  ✔ Scenario 4: Server down fails gracefully with connection error (4.33ms)
  ✔ EventStream.fail() rejects waiting consumer with the error (1.34ms)
  ✔ EventStream.fail() rejects subsequent consumer calls (0.25ms)
  ✔ sendTurn idle timeout fails stream when no data received within timeout (233.68ms)
  ℹ tests 7
  ℹ suites 0
  ℹ pass 7
  ℹ fail 0
  ```

---

## Follow-Up Hardening & Regression Fixes

### Fix 10: Suppress Spurious Premature-Close turnError When Stopped by User
- **What Changed**: Added a per-turn flag `stoppedByUser` in `ChatViewProvider`. In `handleCancel()` and `newSession()`, `this.stoppedByUser = true` is set before invoking `client.cancel()`. In `handleUserMessage()`, premature stream closure without `turn.done` does not post `turnError` if `stoppedByUser` is true. `stoppedByUser` is reset to `false` at the start of each new turn. Stopping a turn now produces only `turnCancelled`, and starting a new session mid-stream produces only `resetSession`, with no `turnError` in either case.
- **Files Modified**:
  - `src/ui/chatViewProvider.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0; verified by provider test suite)

---

### Fix 11: Render "(Turn cancelled)" Notice Before Clearing Assistant Bubble
- **What Changed**: In `src/ui/chatHtml.ts`, in the `'turnCancelled'` message handler, ensured `flushRenderAssistant()` flushes any pending RAF updates, and the `"(Turn cancelled)"` note is appended directly into `currentAssistantBubble` before `setGenerating(false)` and `currentAssistantBubble = null` are called. This ensures the cancellation note reliably appears directly underneath the partial streamed response text.
- **Files Modified**:
  - `src/ui/chatHtml.ts`
- **Test Result**: `PASS` (`tsc --noEmit` succeeded with code 0)

---

### Fix 12: Provider-Level Test Suite (`tests/provider.test.cjs`)
- **What Changed**: Added a provider-level test suite `tests/provider.test.cjs` using `esbuild.buildSync` with `--alias:vscode` mapped to `tests/vscodeStub.cjs`. The stub exports `workspace.getConfiguration`, `Uri`, `window`, and `commands`, backed by a shared `globalThis.__vscodeSettings`. Configured a mock SSE HTTP server testing 5 provider-level interaction sequences:
  1. Normal turn (`userMessage` -> `turn.start` -> `token` -> `turn.done` -> `idle`)
  2. HTTP 500 on turn start (`turnError` -> `idle`)
  3. Stream closing without `turn.done` (`turnError` "Connection to TrueForge closed unexpectedly" -> `idle`)
  4. Mid-stream cancel (`turnCancelled` -> `idle`, no `turnError`)
  5. Mid-stream new session (`resetSession` -> `idle`, no `turnError`)
  Added `tests/provider.test.cjs` to the `test:client` script in `package.json`.
- **Files Modified/Created**:
  - `tests/vscodeStub.cjs`
  - `tests/provider.test.cjs`
  - `package.json`
- **Test Result**: `PASS` (5/5 provider tests passing)

---

### Fix 13: Configurable Idle Timeout (120s Default & glacier.idleTimeoutMs)
- **What Changed**: Changed default idle timeout from 30,000 ms to 120,000 ms in `DEFAULT_CONFIG.idleTimeoutMs`. Added `glacier.idleTimeoutMs` setting in `package.json` under `contributes.configuration` and updated `src/config/config.ts` to read `glacier.idleTimeoutMs` from VS Code configuration. Updated `tests/idleTimeout.test.cjs` to assert the 120,000 ms default value.
- **Files Modified**:
  - `package.json`
  - `src/config/config.ts`
  - `src/trueforge/client.ts`
  - `src/trueforge/types.ts`
  - `tests/idleTimeout.test.cjs`
- **Test Result**: `PASS`

---

## Full Test & Validation Output

### 1. `npm run check-types`
```text
> glacier@0.0.1 check-types
> tsc --noEmit
```
Result: Code 0 (Success)

### 2. `npm run lint`
```text
> glacier@0.0.1 lint
> eslint src
```
Result: Code 0 (Success, 0 warnings, 0 errors)

### 3. `node esbuild.js`
```text
[watch] build started
[watch] build finished
```
Result: Code 0 (Success, extension.js bundled cleanly)

### 4. `npm run test:client`
```text
> glacier@0.0.1 test:client
> node --test tests/client.test.cjs tests/eventStream.test.cjs tests/idleTimeout.test.cjs tests/provider.test.cjs

✔ Scenario 1: HTTP 500 on turns fails with appropriate error (90.4542ms)
✔ Scenario 2: Stream closing without turn.done delivers events then ends cleanly without turn.done (17.8714ms)
✔ Scenario 3: Mid-stream cancel aborts stream and calls cancel endpoint (24.9539ms)
✔ Scenario 4: Server down fails gracefully with connection error (6.7447ms)
✔ EventStream.fail() rejects waiting consumer with the error (2.1486ms)
✔ EventStream.fail() rejects subsequent consumer calls (0.4275ms)
✔ DEFAULT_CONFIG idleTimeoutMs defaults to 120000 (0.9958ms)
✔ sendTurn idle timeout fails stream when no data received within timeout (264.817ms)
✔ Provider: normal turn (164.2678ms)
✔ Provider: HTTP 500 on turns (19.7918ms)
✔ Provider: stream closing without turn.done (23.6914ms)
✔ Provider: user cancel mid-stream (94.6938ms)
✔ Provider: new session mid-stream (73.7689ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 795.0046
```
Result: Code 0 (13 passed, 0 failed)
