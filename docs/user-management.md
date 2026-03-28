# User Management & Database Architecture

## Overview

Participants are created by researchers using CLI tools. Each participant belongs to a **session** (a run of a study) and a **cohort** (an experimental condition). The cohort determines which LLM provider and model the participant uses during chat stages.

## Data Flow

```
Researcher (CLI)                          Participant (Browser)
─────────────────                         ────────────────────
1. import-study                           5. Login (identifier + password)
2. create-session                            → bcrypt comparison
3. generate-participants                     → sets cookies: participant_id, chat_provider
   → creates DB records                   6. Study page loads stages from DB
   → generates 3-word identifier          7. Open AI Assistant
   → generates 6-word password (hashed)      → chat config resolves:
4. add-api-key                                  participant → cohort → provider
   → links API keys to cohorts                  participant → assignApiKey() → API key
                                             → creates DatabaseConversationBackend
                                             → conversations stored in DB
```

## Database Tables

### Study Structure (Prisma-managed)

| Table | Purpose |
|-------|---------|
| `studies` | Study definition (title, description, fallback provider) |
| `cohorts` | Experimental condition (ai_access, ai_training, provider, model) |
| `stages` | Ordered phases with config (JSONB), content, duration |
| `stage_files` | Downloadable files with SHA-256 hashes |
| `study_sessions` | A run of a study |
| `participants` | Login credentials (identifier, bcrypt password hash) |
| `participant_progress` | Stage completion tracking |

### Chat Storage (Prisma-managed)

| Table | Purpose |
|-------|---------|
| `chat_conversations` | Full serialized conversation state (JSONB), keyed by participant + threadId |
| `chat_logs` | Individual turns (user/assistant messages, provider, model, tokens) |
| `chat_file_logs` | File references in chat (with SHA-256 dedup against task files) |

### Key Pool (raw SQL, not Prisma-managed)

| Table | Purpose |
|-------|---------|
| `api_keys` | API keys for LLM providers (with usage counters for load balancing) |
| `cohort_key_pools` | Links cohorts to their available API keys |
| `session_key_assignments` | Audit log of which participant got which key |

Set up via: `npx tsx cli/run-sql.ts sql/setup.sql`

## Participant Authentication

1. Researcher runs `npx tsx cli/generate-participants.ts <session-id> --count N --cohort <cohort-id>`
2. This generates:
   - **Identifier**: 3 random words joined by hyphens (e.g., `bison-horse-shore`)
   - **Password**: 6 random words joined by hyphens (e.g., `crane-polar-patch-quail-patch-tiger`)
   - Password is stored as a **bcrypt hash** in the database
3. Participant enters identifier + password in the app
4. Login route verifies via `bcrypt.compare()`, sets httpOnly cookies

### Cookies Set at Login

| Cookie | Value | Purpose |
|--------|-------|---------|
| `participant_id` | DB ID (integer) | Identifies the participant for all server-side queries |
| `chat_provider` | `anthropic` / `openai` / `gemini` | Quick lookup for chat config (also verified from DB) |

## API Key Resolution

API keys are **never hardcoded** in the app or environment variables (on production). They live in the database and are assigned per-request:

1. Chat request arrives with `participant_id` cookie
2. `getChatConfig()` looks up participant → cohort → provider
3. Calls `assign_api_key(participantId, provider)` — a PostgreSQL SECURITY DEFINER function that:
   - Finds the participant's cohort
   - Selects the least-used active key for that provider in the cohort's key pool
   - Increments the usage counter (load balancing)
   - Logs the assignment in `session_key_assignments`
   - Returns the API key
4. The key is passed directly to the `Conversation` constructor via the `apiKey` config field — **never stored in `process.env`** (critical for serverless where instances are shared)

## Provider & Model Strings

The `provider` field in cohorts uses these values:

| Provider | Value | Default Model |
|----------|-------|---------------|
| Anthropic (Claude) | `anthropic` | `claude-sonnet-4-5-20250929` |
| OpenAI (GPT) | `openai` | `gpt-5` |
| Google (Gemini) | `gemini` | `gemini-2.5-flash` |

These are the values used by the `ucl-study-llm-chat-api` SDK internally. They are **not** from models.dev — they are the SDK's own provider identifiers.

The `model` field in cohorts can override the default. Model strings are provider-specific:

### Anthropic Models
- `claude-sonnet-4-5-20250929` (default)
- `claude-sonnet-4-5-20250514`
- `claude-haiku-3-5-20241022`

### OpenAI Models
- `gpt-5` (default)
- `gpt-4o`
- `gpt-4o-mini`

### Google Gemini Models
- `gemini-2.5-flash` (default)
- `gemini-2.5-pro`
- `gemini-2.0-flash`

## Conversation Isolation

Each participant's conversations are isolated:

- `DatabaseConversationBackend` is created per-request, scoped to the participant's ID
- `listThreads()` only returns threads belonging to that participant
- `getOrCreateConversation()` keys on `(participantId, threadId)`
- Different participants on the same serverless instance cannot see each other's data
- The `StateWriter` saves full conversation state to the DB after each turn
- The `DatabaseWriter` logs individual turns to `chat_logs` for research analysis

## CLI Commands Reference

```bash
# Import study from YAML
npx tsx cli/import-study.ts studies/example/

# Create a session
npx tsx cli/create-session.ts <study-id> --label "Session Name"

# Generate participants (prints credentials to distribute)
npx tsx cli/generate-participants.ts <session-id> --count N --cohort <cohort-id>

# Add API key to the pool for specific cohorts
npx tsx cli/add-api-key.ts <provider> <api-key> <cohort-db-id> [cohort-db-id ...]

# Set up key pool tables (run once after DB creation)
npx tsx cli/run-sql.ts sql/setup.sql

# Export study results
npx tsx cli/export-results.ts <session-id> --output-dir ./exports
```
