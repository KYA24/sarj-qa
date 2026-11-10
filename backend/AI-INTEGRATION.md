# Optional AI source analysis

AI runs only after an explicit user action. Source import, editing, deterministic extraction and test execution do not call a provider automatically.

`POST /api/projects/{projectId}/analyze` accepts `{ "useAi": true, "useFree": true }` to select the bundled shared Cloudflare demo provider. Authentication follows the workspace mode: isolated loopback demo without sign-in, Google owner session on a private deployment, or the optional legacy keyed mode. Mutations require `X-Sarj-Request: studio` in demo/Google modes. A configured private provider is optional, not required for the free demonstration.

Sources are bounded and text credentials are masked. Images may contain visual information that cannot be automatically redacted; the interface explicitly explains external processing. The free worker permits two images, 18,000 text characters and a shared 20-attempt daily budget. See [FREE-AI.md](../docs/FREE-AI.md) for current limits, models and privacy. There is no paid fallback.

Returned drafts cite existing source IDs and locations. Validation rejects unknown sources, malformed structured output and oversized drafts. Model output remains `Inferred / Needs Review` or `Unknown`; it cannot become `Verified`. Existing authoritative requirements and approved tests are preserved. Screenshot-only evidence remains static manual review, not browser automation. Provider failures save no partial analysis.

`POST /api/projects/{projectId}/design` with `{ "useAi": true }` is separate grounded test drafting. Proposed tests remain unapproved and inferred; undocumented endpoint paths are rejected. Deterministic assertions, not AI, decide automated outcomes.

## Verification boundary

On 10 November 2026 the free Cloudflare text and vision paths both returned actual responses through the application API, with valid source references and unverified draft status. Existing synthetic interface imagery was reused; no new capture or paid inference occurred. This does not establish compatibility with every custom provider or model.

Pure validation checks require no inference call:

```sh
source scripts/env.sh
dotnet run --project backend/tests/AiAnalysisChecks -c Release
```

These cover provenance, confidence downgrade, unknown-source rejection, secret masking, structured validation and preservation of authoritative data. Private runtime logs and databases are deliberately excluded from this repository.
