# MainGate — AI Operations Assistant (PoC 1)

Ask natural-language questions about property-management data from inside Google Chat.

```
@MainGate how many properties do you have?
@MainGate Who manages Harbor View Condos?
@MainGate which work orders are still open?
```

Built from [docs/PRD.md](docs/PRD.md); [spec.md](spec.md) covers how it works, what's deployed, and
what it deliberately doesn't do.

## Status: Phase 1 (Crawl) — read only, live in Google Chat

- ✅ Working end-to-end in Google Chat against a deployed Cloud Run service
- ✅ Answers open-ended questions — the whole dataset goes to Gemini with each question, so it isn't
  limited to a fixed list of supported phrasings
- ✅ Google Chat request verification (bearer token audience + issuer)
- ⬜ Phase 2 (controlled updates) and Phase 3 (proactive agent) — not built
- ⬜ Real MainGate data — `data/sample-data.json` is placeholder

## Quick start

```bash
npm install
cp .env.example .env     # set GEMINI_API_KEY
npm run dev
npm test
```

```bash
curl -X POST localhost:8080/chat -H "Content-Type: application/json" \
  -d '{"message": {"text": "@MainGate how many properties do you have?"}}'
```

## Know before building on this

- **Answers are not deterministic.** Gemini reads the raw data and can miscount. Good enough to
  validate a conversational interface; not something to report to a customer unchecked.
- **The dataset must fit in a prompt.** ~2KB today. A real export needs a query or retrieval layer.
- **Phase 2 must reintroduce a validated action allowlist.** "Gemini never writes to storage" is
  currently true only because nothing writes at all.

## Stack

Node.js 20, TypeScript, Express on Cloud Run, with the Gemini API via `@google/generative-ai`.
