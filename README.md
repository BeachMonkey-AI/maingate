# MainGate — AI Operations Assistant (PoC 1)

A proof of concept for asking natural-language questions about property-management data through
Google Chat. Built from [docs/PRD.md](docs/PRD.md); see [spec.md](spec.md) for exactly what's
implemented versus documented-but-not-built.

```
@MainGateBot Show me property 1001
@MainGateBot Who manages Madison Apartments?
@MainGateBot List open maintenance tickets
```

## Status: Phase 1 (Crawl) — read only

- ✅ Loads operational data from a JSON file (`data/sample-data.json` — placeholder data, not a
  real MainGate export)
- ✅ Answers the PRD's example questions, via Gemini function calling when `GEMINI_API_KEY` is set,
  or a deterministic rule-based parser otherwise (also what the test suite uses)
- ✅ Google Chat webhook (`POST /chat`) with request verification (no-ops with a console warning if
  `GOOGLE_CHAT_PROJECT_NUMBER` isn't set — see `src/chat/verify.ts`)
- ⬜ Phase 2 (controlled updates) and Phase 3 (proactive agent) — not built; see spec.md for how
  the code is shaped to grow into them
- ⬜ Deployed anywhere — this environment has no GCP project, `gcloud` CLI, or credentials, so
  Cloud Run / Firestore / a real Google Chat app registration are documented steps, not done ones

## Quick start

```bash
npm install
npm run dev          # http://localhost:8080, rule-based parser (no API key needed)
npm test
```

Simulate a Chat message:

```bash
curl -X POST localhost:8080/chat -H "Content-Type: application/json" \
  -d '{"message": {"text": "@MainGateBot Show me property 1001"}}'
```

See [spec.md](spec.md) for the request flow, data model, and deployment steps.

## Stack

Node.js 20, TypeScript, Express — chosen for a small Cloud Run-friendly service with first-party
Gemini (`@google/generative-ai`) and Firestore (`@google-cloud/firestore`) SDKs. No framework
beyond Express; the PRD explicitly scopes this away from platform-building.
