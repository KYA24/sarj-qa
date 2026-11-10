# Local booking fixture

`node fixtures/server.mjs` binds loopback IPv4 port 5190. This is not the real Nuzul platform; the Staff Console is not deployed here.

`nuzul.openapi.json` is the authoritative test source; `build-openapi.mjs` regenerates it. The booking schema explicitly establishes mandatory fields and checkout strictly later than check-in. The fixture intentionally accepts reversed dates and returns 201 with negative nights. This violates its contract and provides a genuine reproducible deterministic failed assertion (expected HTTP 400).

Example valid booking: `{"guestName":"Demo Guest","checkIn":"2030-01-10","checkOut":"2030-01-13"}`. Invalid ordering changes checkout to `2030-01-09`.

Operations: health, list/create booking, retrieve/update booking by concrete ID. Booking `1` exists at startup; mutations persist only within this process. `/protected` accepts `Bearer fixture-token` (public fixture-only credential). `/echo-auth`, `/redirect`, `/slow` are controlled runner-security test endpoints, deliberately absent from generated business requirements; they prove redaction, disabled redirects and bounded timeout. They are not Nuzul product capabilities.
