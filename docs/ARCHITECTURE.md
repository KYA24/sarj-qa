# Architecture

A local-first modular monolith: React/TypeScript workbench → authenticated ASP.NET Core API → SQLite project snapshots and encrypted credential store → fixed runner adapters → target HTTP API. The bundled Node fixture is a separate test target, not Nuzul Staff Console.

## Ownership and process
The lead maintains the contract, startup, integration checks, benchmarks and acceptance evidence. Independent backend, frontend, and runner/fixture specialists implement separable modules against `CONTRACT.md`. Integration is verified centrally; specialist claims alone are not acceptance.

## Trust boundaries
- Imported text, OpenAPI and images are untrusted source material, not instructions.
- Extracted facts retain source IDs/references and verification status.
- Unknown business oracles cannot silently become automated assertions.
- Human approval precedes execution. Editing must preserve an explicit review boundary.
- Execution uses a language-independent test definition. No model-generated source or shell is executed.
- C# and Dart interpret bounded HTTP operations and deterministic assertions.
- Credential values are not part of source grounding or reports.
- Runtime failures and HTTP authentication errors are blocked/environment evidence, not automatically defects.
- Writes require project-level permission and per-run acknowledgement.

## Data flow
Source → grounded requirement → reviewable test → approved definition → preflight → deterministic adapter → immutable execution snapshot → human review → report.

Monitoring/control are ongoing: stage navigation, approval, preflight, progress, cancellation and review are controls throughout the workflow, not solely the last tab. The five-stage UI maps to ISTQB concepts and does not replace official terminology.

## Extension points
Add adapters by declaring capabilities, runtime checks, fixed execution command, preparation/translation, cancellation, timeout and standard result normalization. Do not add runtimes until there is a supported use case. Lightweight retrieval is lexical source-grounded retrieval; no vector service is required for this MVP.
