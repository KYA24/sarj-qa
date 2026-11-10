# Standards and technical references

Verified against primary documentation during implementation (2026-11-10):

- [ISTQB CTFL syllabus v4.0.1](https://www.istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf): the five UI stages are a convenience mapping to planning/analysis, design, implementation, execution and completion. Monitoring/control remain ongoing. Traceable source requirements, expected outcomes and evidence support test analysis and defect reporting; no claim of ISTQB product certification is made.
- [Dart `dart:io`](https://dart.dev/libraries/dart-io), [`HttpClient`](https://api.dart.dev/dart-io/HttpClient-class.html), [`connectionFactory`](https://api.dart.dev/dart-io/HttpClient/connectionFactory.html): the standalone Dart SDK supports HTTP clients and controllable socket creation. The fixed adapter uses this to validate destination addresses rather than invoking generated commands.
- [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html): operation definitions, response codes, schemas and documented examples form the local fixture's source of truth. `x-test-cases` is an application-specific specification extension, not a standard OpenAPI test-case field.
- [.NET HttpClient guidelines](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines): C# HTTP execution uses timeouts/cancellation and controlled handlers. No runtime-speed superiority is claimed; compare only measured fixture runs.

## Evidence and scope

`fixtures/nuzul.openapi.json` is a purpose-built, authoritative **local demonstration contract**, not reverse-engineered documentation of the real Nuzul service. `fixtures/server.mjs` deliberately violates checkout-date validation. This known fixture defect creates reproducible failure evidence without claiming access to any unavailable Nuzul console. The in-memory fixture retains bookings only during its process lifetime; the QA workspace persists project/runs separately in SQLite.

Authentication rejection is an execution blocker by this product's policy, including cases that document an expected 401; a human can review that evidence. This conservative classification is documented rather than inferred from ISTQB. AI is an optional source-grounded assistant, never the authority determining assertion outcomes.
