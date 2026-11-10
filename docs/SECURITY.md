# Security scope

This is a single-owner QA workspace, not a multi-tenant service or penetration-test certification.

## Workspace modes

- **Local demo:** no sign-in; explicit HTTP loopback bind, loopback peer/Host and same-origin checks, mutation header, separate `.demo-*` store and refusal of symlinked data paths or cloud database configuration. Never expose it through a public tunnel.
- **Private published workspace:** server-side Google OAuth, verified-email owner allowlist, Secure/HttpOnly session cookie and same-origin mutation checks. No owner email or credentials are shipped in the public source.
- **Optional legacy keyed mode:** constant-time Studio-key check; it is not the default reviewer launch.

## Execution and evidence

- Stored document bodies are encrypted using ASP.NET Data Protection. Local data and its keyring must be backed up together privately; this does not protect against a compromised OS account.
- Provider/target secrets are write-only through project APIs and masked in snapshots and exports. Local demo/runtime stores are excluded from Git.
- HTTP targets reject embedded credentials and private/reserved destinations except the exact configured loopback fixture. Socket-level destination validation, disabled redirects and no inherited proxy prevent simple target bypasses.
- Only fixed C# and Dart runners execute structured definitions. No generated shell/code is executed.
- Mutation tests need approved cases, saved environment permission and explicit per-run permission. Output, timeouts and concurrency are bounded; cancellation propagates.
- Automated outcomes are preserved; human observations/reviews are separate. Skipped runs do not erase earlier meaningful observations. Blocked execution is not a confirmed product defect.
- AI is explicit opt-in external processing. Drafts require review; the free worker has a shared atomic quota and no paid fallback. See [FREE-AI.md](FREE-AI.md).

## Reproducible checks and limitations

The public copy includes `scripts/demo-isolation-check.mjs` (5288 demo only), backend authentication checks with simulated Google transport, and pure AI/workflow/report tests under `backend/tests/`. Runtime test records, private reports and owner data are intentionally omitted.

Release checks exercised 15 demo-isolation boundaries, 34 authentication checks and both runner adapters against the intentionally faulty loopback fixture. Google checks do not represent a live owner login. A successful test suite does not establish safe multi-user hosting or eliminate the need to select authorized test targets.
