# Public release verification — 11 November 2026

## Completed checks

- Public-source setup completed in 15 seconds with the required SDKs already installed and warm package caches. Backend, C# runner and frontend builds succeeded. This is not a cold SDK-download benchmark.
- 15 isolated local-demo checks passed: mode, seed separation, hostile Origin/Host/Fetch-Metadata rejection, protected writes, ordered step persistence, independent human evidence and preservation after Skipped. Test-created projects were archived; the seeded historical exercise was unchanged.
- Both C# and Dart executed two approved loopback-fixture cases: valid booking Passed; reversed dates Failed against the intentionally faulty fixture. The failed negative check is the expected defect detection, not a runner failure.
- 34 Google-handler authentication checks passed using simulated Google transport. Live owner Google login was not repeated.
- The 10-slide presentation passed Space progression and back navigation at 1440×900 and 390×844, including reduced motion, local asset/image loading and actual Brando glyphs. No new screenshot, video or PDF was captured.
- The application links explicitly to `/presentation/index.html`. The server also redirects `/presentation/` to that page; actual GET responses were verified after rebuilding.
- The existing guide verification covers 17 steps, 16 illustrated, source image decoding, search, keyboard navigation, zoom and representative responsive bounds. Final new pixels/printed PDF were not captured because the owner prohibited recapture.
- The free Cloudflare application-API text and vision integrations previously returned source-linked, unverified drafts. No paid fallback is configured. Availability remains subject to the shared quota.

## Source/privacy review

Independent bounded review found no credential, owner-email or runtime-store file in the staged public source. Guide image hashes matched; PNG files contain no EXIF/text metadata. Existing synthetic images were reused. Owner/private-workspace data, environment files, database/keyring, raw runtime evidence and private repository history are not included. The historical exercise report is sanitized for public distribution.

The public source intentionally has a new Git history. No private repository was made public. This report does not claim aesthetic approval, a live staff console, unlimited free inference, or certification to a standard.

## Reproduce

```sh
./scripts/setup.sh
./scripts/start.sh
# Another terminal; demo defaults to 5288:
node scripts/demo-isolation-check.mjs
source scripts/env.sh
dotnet run --project backend/tests/AuthChecks -c Release
npm --prefix scripts ci
npx --prefix scripts playwright install chromium
node presentation/verify.cjs
```

`CHROME_PATH` selects an existing browser executable. `SARJ_PRESENTATION_URL` overrides the presentation test URL. The presentation verifier does not capture images. Generated runtime artifacts remain ignored.
