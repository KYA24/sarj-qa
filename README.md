# Sarj QA Studio · سرج QA

A runnable QA workspace: **expectations → checks → evidence**. Arabic/English, React + TypeScript, ASP.NET Core, SQLite, and real C# / Dart HTTP runners. AI drafts are reviewed by the tester; deterministic rules decide automated outcomes.

## Try locally — no account or sign-in

Requirements: Node.js 22+, .NET 10 and Dart. The setup script can install missing SDKs privately on Linux/macOS. First-time SDK download can be large; no paid API is required.

```bash
git clone https://github.com/KYA24/sarj-qa.git
cd sarj-qa
./scripts/setup.sh
./scripts/start.sh
```

Open **http://127.0.0.1:5288** and choose **ابدأ تجربة النظام**. There is **no password, access key, or Google login** for this local demo.

- A sanitized NZL-217 exercise is bundled: 11 clearly labeled historical observations and 2 runnable local fixture checks. Historical evidence is not presented as a new run on your machine.
- Local demo data stays in `.demo-data/`, independent of any owner's `.data/`, Google session, or cloud database. No private owner projects, credentials, or database are included.
- The local booking fixture intentionally accepts reversed dates. A negative test should fail; this is a demonstration, not the unavailable real staff console.
- Approve a test and explicitly allow writes before executing mutations. C# and Dart share structured definitions and evidence records.
- Optional Cloudflare AI has a shared daily demo allowance; click explicitly to send sources for draft analysis. No secret key is shipped and no paid fallback is used. Deterministic features work when AI is unavailable.
- The **دليل الاستخدام** button opens the illustrated guide, using existing interface images only. **عرض المشروع** opens a 10-slide interactive presentation; **Space** reveals elements and advances slides.

## Local versus private published workspace

The startup screen distinguishes the unauthenticated local demo from an independently deployed, Google-protected owner workspace. An optional `SARJ_PUBLISHED_ORIGIN=https://your-private-site.example` supplies that deployment's link; it does not grant access. The public source does not include access to anyone else's workspace.

Google deployment requires server-side owner/OAuth settings and HTTPS. Never publish the keyless demo via a tunnel or bind it to a public interface. Local mode enforces loopback and same-origin requests. See [local isolation and deployment](docs/LOCAL-DEMO.md).

## Included features

- Text, screenshots and OpenAPI JSON/YAML sources, source references and reviewable expectations.
- Separate repeatable step fields with add/remove controls.
- Manual observations separate from automated evidence; skipped runs do not erase prior meaningful observations.
- JSON assertions, explicit mutation permissions, bounded URLs, timeouts, cancellation and runtime readiness.
- Readable HTML summary, JSON and editable RTF reports.
- Free Cloudflare text/vision drafting with schema/source checks; outputs remain unapproved drafts.

## Read more

- [Release verification and reproduction](docs/RELEASE-VALIDATION.md)

- [Usage guide implementation and image coverage](docs/GUIDE-IMPLEMENTATION.md)
- [Local demo](docs/LOCAL-DEMO.md)
- [Free AI, limits and privacy](docs/FREE-AI.md)
- [Actual historical task results](docs/NZL217-LIVE-TRIAL-20261110.md)
- [Architecture](docs/ARCHITECTURE.md), [runner contract](docs/RUNNERS.md), [testing methodology](docs/STANDARDS.md)
- [Presentation](presentation/index.html) — served at `/presentation/` after startup.

The simplified workflow uses testing-process concepts as an organizing reference; it is **not an ISTQB/ISO certification**. Static image/transcript reviews, local fixture execution and real external API observations are distinguished in the task report. A missing staff-console environment remains a limitation, not a passing test.
