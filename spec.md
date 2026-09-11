# spec — what's actually built

Implements Phase 1 ("Crawl") of [docs/PRD.md](docs/PRD.md): read-only Q&A over a JSON operational
dataset, reachable via a Google Chat webhook. Phases 2 (writes) and 3 (proactive agent) are
deliberately not implemented — see "Extending to Phase 2" below for how the code is shaped to take
them.

## Data model

`data/sample-data.json` — three flat collections: `properties`, `workOrders`, `vendors`. Types in
`src/types.ts`. This is placeholder data standing in for a real MainGate export; nothing here is
production data.

## Request flow

```
POST /chat  (Google Chat event)
    -> verify request is from Google Chat        src/chat/verify.ts
    -> extract message text, strip @mention       src/chat/webhook.ts
    -> parse text into an Intent {action, params}  src/intent/*
    -> executeIntent() looks action up in an       src/actions/registry.ts
       allowlist and runs it against the DataStore  src/data/*
    -> plain-text response back to Chat
```

## Where the PRD's constraints live in the code

- **"Gemini should never write directly to storage."** `GeminiIntentParser` (src/intent/geminiIntentParser.ts)
  only ever returns an `{action, params}` pair — it has no reference to a `DataStore`. Whatever it
  returns is re-checked against `PHASE_1_ACTIONS` in `src/actions/registry.ts` before anything runs;
  an action Gemini invents or a Phase 2/3 name it guesses is rejected there, not trusted.
- **Storage-agnostic data layer.** `DataStore` (src/data/store.ts) is the only interface actions and
  the webhook depend on. `JsonDataStore` is the Phase 1 implementation; `FirestoreDataStore` is
  written against the same interface as a documented Phase 2 starting point, but is untested here —
  this environment has no GCP project or credentials to verify it against.
- **Deterministic parsing without a live API key.** `RuleBasedIntentParser` implements the same
  `IntentParser` interface as the Gemini one, covering exactly the PRD's Phase 1 example questions.
  `createIntentParser()` (src/intent/index.ts) picks Gemini when `GEMINI_API_KEY` is set, otherwise
  falls back to it — this is also what tests use, so CI doesn't depend on network access or a key.

## Supported questions (Phase 1)

| You ask | Action |
|---|---|
| "Show me property 1001" | `getProperty` |
| "Madison Apartments" (bare name) | `findPropertyByName` |
| "Who manages Madison Apartments?" | `getPropertyManager` |
| "List open maintenance tickets" / "...for property 1001" | `listOpenMaintenanceTickets` |
| "Who is assigned to work order 456?" | `getWorkOrderAssignee` |

## Extending to Phase 2 (not built)

The seams are already there: add handlers to `PHASE_1_ACTIONS` in `src/actions/registry.ts` (rename
the map, it's the whole allowlist), add matching `FunctionDeclaration`s in
`geminiIntentParser.ts`, and give `DataStore` real write methods backed by `FirestoreDataStore`.
The PRD's audit requirement (timestamp/user/action/before/after) has no code yet — it belongs
wherever the first write action lands, not before there's a write to log.

## What's deliberately not here

No Google Cloud project, Firestore instance, Gemini API key, or Google Chat app registration exists
for this PoC yet — none of that can be created from this environment. "Deployment" below is
documented, not verified.

## Local development

```
npm install
cp .env.example .env      # optional — unset GEMINI_API_KEY is fine, uses the rule-based parser
npm run dev
curl -X POST localhost:8080/chat -H "Content-Type: application/json" \
  -d '{"message": {"text": "@MainGateBot Show me property 1001"}}'
```

## Tests

```
npm test
```

Covers the data store, the action registry (including that Phase 2/3 action names are rejected),
the rule-based parser against the PRD's example questions, and the webhook end-to-end using
`supertest`. `GeminiIntentParser` has no test coverage — it needs a real API key to exercise
meaningfully, and this environment doesn't have one.

## Deploying (not done from here — no GCP access in this environment)

1. `gcloud projects create <project>` (or use an existing one), enable the Cloud Run, Firestore,
   and Chat APIs.
2. Set `GEMINI_API_KEY` (from Google AI Studio) as a Cloud Run environment variable or Secret
   Manager secret — never commit it.
3. `gcloud run deploy maingate --source . --region <region> --allow-unauthenticated=false`
4. Register a Google Chat app in the Cloud project pointing at the deployed URL's `/chat`; set
   `GOOGLE_CHAT_PROJECT_NUMBER` to this Cloud Run project's number so `src/chat/verify.ts` actually
   verifies requests.
5. For Firestore: set `DATA_STORE=firestore` once `FirestoreDataStore` is finished and seed
   `properties` / `workOrders` / `vendors` collections shaped like `data/sample-data.json`.
