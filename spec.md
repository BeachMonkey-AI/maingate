# spec — what's actually built

Implements Phase 1 ("Crawl") of [docs/PRD.md](docs/PRD.md): read-only Q&A over a JSON operational
dataset, reachable from Google Chat. Phases 2 (writes) and 3 (proactive agent) are not implemented.

## How it answers questions

The whole dataset is sent to Gemini with every question, and Gemini answers in natural language:

```
POST /chat  (Google Chat event)
    -> verify the request really came from Google Chat   src/chat/verify.ts
    -> extract message text, strip @mention              src/chat/webhook.ts
    -> load dataset (cached in memory)                   src/data/dataset.ts
    -> ask Gemini the question with the data inline      src/gemini/answerer.ts
    -> reply
```

There is deliberately no intent-classification or per-question action layer. An earlier version
mapped questions onto an allowlist of five hand-written actions; adding any new capability meant
editing three files, and anything unanticipated ("how many properties do you have?") simply failed.
Putting the data in the prompt trades that away for questions working without being predicted.

**What this costs**, and why it's acceptable here:

- **No deterministic guarantee.** Gemini could miscount or misread. Fine for validating a
  conversational interface; not fine for anything reported to a customer or acted on automatically.
- **Doesn't scale past a dataset that fits in a prompt.** `data/sample-data.json` is ~2KB. A real
  MainGate export would need retrieval or a query layer instead.
- **Only safe while nothing writes.** The PRD's "Gemini must never write directly to storage" holds
  trivially today because there is no write path at all. Phase 2 must reintroduce a validated action
  allowlist — do not let the model reach a mutation the way it now reaches data.

## Data

`data/sample-data.json` — `properties`, `workOrders`, `vendors`. Types in `src/types.ts`. This is
placeholder data standing in for a real MainGate export; none of it is production data.

Swap the file with `DATA_FILE`. It's read once and cached for the process lifetime, so changing it
requires a restart.

## Request verification

`src/chat/verify.ts` checks the bearer token Google attaches to every request, which cost several
deploys to get right and is worth stating precisely:

- **Audience** is either the Cloud project number (`GOOGLE_CHAT_PROJECT_NUMBER`) or the configured
  endpoint URL (`GOOGLE_CHAT_AUDIENCE`), depending on registration. Both are accepted; the signature
  is verified against Google's certs regardless.
- **Issuer** is `chat@system.gserviceaccount.com` for a plain Chat app, but an app registered as a
  Workspace add-on signs with `service-<PROJECT_NUMBER>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`.
  That second issuer is derived from the project number so only *this* project's add-on account is
  trusted.
- With neither audience env var set, requests pass through **unverified** — the local-dev posture,
  logged loudly, and not safe for a deployed instance.

## Chat event shapes

A plain Chat app posts the message at the top level and takes `{text}` back. An app registered as a
**Workspace add-on** — which this is — nests it under `chat.messagePayload` and requires the reply
wrapped in `hostAppDataAction`. Returning the wrong envelope produces "MainGate not responding" in
Chat *while the service returns HTTP 200*, so both shapes are handled and covered by tests.

## Deployment (live)

| | |
|---|---|
| Cloud Run service | `maingate`, project `gen-lang-client-0746382513`, region `us-central1` |
| URL | `https://maingate-6rtwtngf7q-uc.a.run.app` |
| Chat app registration | project `maingate-chat` (number `596520922206`), Workspace `chat.beachmonkey.ai` |

The Chat app is registered in a **separate, Workspace-owned** project on purpose: Visibility controls
are hard-disabled on personal-account projects, so a Chat app registered there is never visible to
anyone and silently receives no traffic at all.

Redeploy:

```bash
gcloud run deploy maingate --source . \
  --project gen-lang-client-0746382513 --region us-central1 --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=...,GEMINI_MODEL=gemini-flash-latest,\
GOOGLE_CHAT_PROJECT_NUMBER=596520922206,\
GOOGLE_CHAT_AUDIENCE=https://maingate-6rtwtngf7q-uc.a.run.app/chat"
```

`GEMINI_API_KEY` is passed as a plain env var and is visible in the Cloud Run revision. Move it to
Secret Manager before this outlives the demo.

## Who can use it

Testers must be users in the `chat.beachmonkey.ai` Workspace, listed in the Chat app's **Visibility**
field (Cloud console → Google Chat API → Configuration). Personal Gmail accounts and users in other
Workspace orgs cannot be added — reaching those requires publishing to the Google Workspace
Marketplace.

## Local development

```
npm install
cp .env.example .env      # GEMINI_API_KEY is required
npm run dev
curl -X POST localhost:8080/chat -H "Content-Type: application/json" \
  -d '{"message": {"text": "@MainGate how many properties do you have?"}}'
```

## Tests

```
npm test
```

Five tests covering the webhook: mention stripping, that the full dataset reaches the answerer, both
Chat event/reply shapes, graceful failure when Gemini errors, and the health check. Gemini is stubbed,
so tests need no API key or network. `GeminiAnswerer` and `verify.ts` have no unit coverage — both
were verified against the live deployment instead.

## Health check

`GET /health`. Note: **not** `/healthz` — that exact path is intercepted by Google's frontend before
it reaches the container and returns a Google-branded 404.
