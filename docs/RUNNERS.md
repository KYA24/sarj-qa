# Deterministic runner adapters

The test definition is language-independent; see [CONTRACT.md](CONTRACT.md). Both adapters execute the same bounded HTTP operations, not generated source or shell commands. C# is the primary adapter; Dart is a real secondary adapter, not a simulation.

| Adapter | Runtime | Fixed entry point | Capabilities |
|---|---|---|---|
| C# | .NET 10 SDK/runtime | `dotnet runners/csharp/bin/Release/net10.0/Nuzul.Runner.dll` after build | HTTP, status, JSON equality/existence, booking/date checks through API responses |
| Dart | Dart SDK 3.x | `dart runners/dart/main.dart` | Equivalent HTTP assertions and standardized evidence |

No Dart packages are required. Dart uses the official SDK `dart:io` HTTP client to retain explicit socket-level DNS validation and redirect controls. Runners read one JSON document on stdin and emit one JSON array on stdout. Diagnostics use stderr; malformed input exits nonzero.

Input: `{ "baseUrl":"http://127.0.0.1:5190", "authToken":"", "allowMutations":false, "tests":[] }`.
Each test contains approval, method, concrete relative path, body, expected HTTP status, and assertion array. Assertions: `status` compares numeric status string; `jsonEquals` traverses dot-separated object/array paths and compares strings unquoted, other values as JSON; `jsonExists` requires the path (JSON null still exists). No arbitrary expressions or user code execute. Unsupported assertions are Blocked, not failed product tests. A missing deterministic oracle is Needs Review. Unknown path placeholders must be reviewed rather than guessed.

Each result records test ID, outcome, request/response body, expected/actual result, individual assertion outcomes, duration, timestamp, error and evidence reference. Raw response text is preserved except deliberate credential redaction. Request/response evidence is bounded to 256 KiB. Configured secrets and common credential fields are masked; credentials are never a report input.

## Safety and classifications

- Only approved, non-excluded cases execute; otherwise Skipped.
- Mutating methods require stored AND per-run permission in Studio; runners additionally require `allowMutations=true`.
- Authentication failures (401/403), redirects, network errors, denied targets and unsupported capabilities are Blocked even if an HTTP response was received. They are not automatically product defects.
- HTTP(S) only; no embedded credentials; same-origin concrete endpoint paths. DNS is checked/pinned at socket connection. Private/reserved addresses are denied except the exact `NUZUL_FIXTURE_ORIGIN` (default `http://localhost:5190`; startup config uses IPv4 `http://127.0.0.1:5190`). Redirects and proxy inheritance are off.
- Each request is limited to ten seconds. Studio cancellation terminates the Dart child process and cancels C# HTTP requests; incomplete operations are not reported as successful. Runner process isolation is an operation allowlist, **not** an OS sandbox for arbitrary generated programs (none are executed).
- Manual mode with a concrete API path still sends the approved request and records deterministic assertions. Static cases with no API path remain Needs Review for human observations; no visual-only source is translated into an invented API.

## Reproduce equivalent execution

From project root:

```sh
node fixtures/server.mjs
# In another terminal after SDK setup:
.tools/dotnet/dotnet build runners/csharp -c Release
node scripts/runner-contract-test.mjs
```

The harness requires both runtimes and a running local fixture. It executes C#/Dart equivalent valid creation, deliberately invalid checkout, required data rejection, retrieval, update/persistence, list, auth, permission, missing oracle, redirect, unsupported and network-block checks. Evidence is saved to `evidence/runner-contract-results.json`. The intentionally invalid checkout test **must fail** (HTTP 201 actual vs 400 expected); the harness itself passes only when that real failure is detected and runner classifications match.

## Extension interface

Future adapters must provide capabilities, runtime readiness and installation guidance, deterministic structured-definition translation, fixed executable/arguments, timeout/cancellation, bounded standardized evidence, and error classification. Add explicit preflight/UI capabilities before making an adapter selectable. A runtime not installed is an environment blocker, not a test failure. Go/Java/TypeScript runners are not installed for this MVP.

## Live Dart progress

Studio invokes `dart runners/dart/main.dart --ndjson`: one complete, credential-masked JSON execution record plus newline is written and flushed immediately after each case. The backend can save each line before the suite finishes; cancellation preserves already completed records. Output is capped at 8 MB cumulatively. Without the flag, the original single-array stdout protocol is unchanged for benchmarks and external adapter clients. The contract harness validates both protocols, including two actual streamed records (Passed health, deliberately Failed checkout).

The actual extension point is `backend/Adapters.cs` (`ITestRunnerAdapter`), with capability/runtime metadata, preparation and streaming execution plus cancellation. `Jobs` selects a registered adapter rather than dispatching arbitrary commands.
