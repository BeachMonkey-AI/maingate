# PRD: MainGate AI Operations Assistant (Phase 1)

> As given by Odin, 2026-09-11. Kept verbatim for reference; this repo currently implements
> Phase 1 (Crawl) only — see [spec.md](../spec.md) for what's actually built.

## Objective

Demonstrate that operational property management data can be exposed through a conversational
interface inside Google Chat.

The system will:

1. Load operational data from a JSON export.
2. Answer natural-language questions about that data.
3. Make controlled modifications to that data.
4. Allow users to interact entirely through Google Chat.

Success is measured by proving that non-technical users can retrieve and update business data
through conversation.

## Business Problem

MainGate staff must navigate multiple systems and datasets to answer operational questions and
update records.

Examples:

- Which properties have outstanding maintenance issues?
- What units require inspection?
- Who is assigned to this work order?
- Update a vendor phone number.
- Change maintenance status from Open to Complete.

The goal is to reduce friction and create the foundation for future AI agents.

## Project Scope

### In Scope

**User Interface — Google Chat App.** Users interact with:

```
@MainGateBot Show me property 123
```

or

```
@MainGateBot Update work order 456 to Completed
```

**Data Source — Single JSON dataset.** Example:

```json
{
  "properties": [
    {
      "propertyId": 1001,
      "name": "Madison Apartments",
      "manager": "John Smith",
      "status": "Active"
    }
  ]
}
```

Initially loaded from an exported JSON file. Stored in Firestore (preferred), or a JSON file in
Google Cloud Storage.

**AI Layer — Gemini API.** Responsibilities: interpret user intent, map requests to approved
actions, generate natural language responses. Gemini should NEVER write directly to storage. All
updates must go through backend validation.

**Backend — Cloud Run service.** Responsibilities: receive Google Chat messages, invoke Gemini,
validate actions, query data, update data, return responses.

## Crawl / Walk / Run Roadmap

### Phase 1: Crawl — Read Only

Capabilities — users can ask:

```
Show me property 1001
Who manages Madison Apartments?
List open maintenance tickets
```

Success criteria: Google Chat integration operational; Gemini interprets requests correctly; data
returned from JSON store.

### Phase 2: Walk — Controlled Updates

Capabilities — users can perform updates:

```
Assign ticket 123 to Mike
Mark inspection completed
Update vendor phone number
```

Every update must: validate input, log user, log timestamp, record before value, record after
value.

Success criteria: users can safely update operational records through chat.

### Phase 3: Run — Recommendations and Agent Behavior

Capabilities — users can ask:

```
What properties need attention today?
Which work orders appear overdue?
What issues should Ryan review?
```

Agent functions — AI analyzes property health, overdue work, exception conditions, trends.

Success criteria: agent proactively identifies operational issues.

## Architecture

```
Google Chat
    |
    V
Google Chat App
    |
    V
Cloud Run
    |
    +---- Gemini API
    |
    +---- Firestore
```

## Security (for POC)

**Authentication:** Google Workspace user identity passed by Google Chat.

**Authorization:** Simple role model — Read Only User, Operator, Administrator.

**Audit:** every update stored as:

```json
{
  "timestamp": "",
  "user": "",
  "action": "",
  "before": {},
  "after": {}
}
```

## Non-Goals

Do NOT implement: MCP; multi-agent orchestration; Vertex AI Agent Builder; workflow engines;
enterprise governance; data synchronization; multiple databases; advanced scheduling. Keep the
solution intentionally simple.

## Guiding Principle

The goal of this project is not to build an AI platform. The goal is to validate that operational
property-management data can be queried and updated through a conversational Google Chat
experience. If successful, this architecture becomes the foundation for future MainGate
dashboards, workflows, and AI middle-manager agents.
