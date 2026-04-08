# UCL Study Manager

## Project Overview

Electron + Next.js desktop application for managing research studies at UCL London. Participants sit at lab machines at the university and are guided through timed study phases. Some participant cohorts get access to an LLM chatbot (Claude, OpenAI, or Gemini) during certain stages. Researchers define studies using a 3-level YAML hierarchy: study → cohorts → flows.

**Related codebases** (in the parent directory):
- `ucl-study-llm-chat-api` — TypeScript SDK providing unified conversation interface across Claude/OpenAI/Gemini with sandboxed code execution, file handling, streaming, and API key pooling. Used as an **npm dependency** in this project.
- `ucl-study-llm-chat-frontend` — Next.js web app with assistant-ui for researcher chat. Will be restructured as an **npm dependency** to export chat UI components and stream-mapper.
- `test_custom_UI` — Next.js prototype with native provider tools, Langfuse observability, file uploads (reference for patterns).

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│                                                  │
│  ┌───────────────┐    ┌──────────────────────┐  │
│  │  Main Process  │    │   Renderer (Next.js)  │  │
│  │                │    │                      │  │
│  │  - App lifecycle│    │  - Participant UI    │  │
│  │  - YAML loading │    │  - Stage timer       │  │
│  │  - File access  │    │  - Chat (assistant-ui)│  │
│  │  - IPC bridge   │    │  - File download     │  │
│  └───────────────┘    │  - MD content render  │  │
│                        └──────────────────────┘  │
└─────────────────────────────────────────────────┘
          │                        │
          │                        │
    ┌─────▼─────┐          ┌──────▼───────┐
    │  Local FS  │          │ ucl-study-   │
    │  YAML/MD   │          │ llm-chat-api │
    │  files     │          │ (npm dep)    │
    └───────────┘          └──────┬───────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  Scaleway Serverless        │
                    │  PostgreSQL (via Prisma)     │
                    │                             │
                    │  - Cohorts & participants   │
                    │  - Study sessions & progress│
                    │  - Chat logs & file refs    │
                    │  - API key pool             │
                    └─────────────────────────────┘
```

## Tech Stack

| Layer         | Technology                                                  |
|---------------|-------------------------------------------------------------|
| Runtime       | Electron + Next.js (renderer)                              |
| Language      | TypeScript throughout                                       |
| UI            | React, Tailwind CSS, shadcn/ui                             |
| Chat UI       | assistant-ui (imported from ucl-study-llm-chat-frontend)   |
| LLM           | ucl-study-llm-chat-api (npm dep via git SSH)               |
| Database      | Prisma ORM + Scaleway Serverless PostgreSQL                |
| Admin         | Prisma Studio + CLI scripts (TypeScript)                   |
| Observability | PostgreSQL logging (Langfuse can be added later via Writer)|

## Data Model

```
study
  ├── cohorts ── stages ── stage_files
  └── sessions
       └── participants
            ├── progress (per stage)
            └── chat_logs
                 └── chat_file_logs
```

| Model               | Purpose                                                                                  |
|----------------------|------------------------------------------------------------------------------------------|
| `Study`             | Imported from study.yaml. Title, description, inline base stages.                        |
| `Cohort`            | Experimental condition. ID, label, provider/model/fallback. Each cohort inherits base stages with optional overrides. |
| `Stage`             | Ordered phase within a cohort's flow. Title, duration, content, `chatbot` boolean, questions, input config, link, confirmation. Belongs to Cohort. |
| `StageFile`         | Downloadable task file with description and SHA-256 hash. Belongs to Stage.              |
| `StudySession`      | A run of a study with a specific set of participants. Links to Study.                    |
| `Participant`       | 4-word identifier (e.g., `stern-satin-karma-unity`), assigned Cohort + StudySession.     |
| `ParticipantProgress`| Tracks `started_at`, `completed_at` per stage per participant.                          |
| `ChatLog`           | Conversation turns: role, content, provider, model, token counts. Belongs to Participant.|
| `ChatFileLog`       | File refs in chat. Known task files stored as filename (hash match), unknown files stored as base64 + mimetype blob. |

### Chatbot Visibility

Simple per-stage check (resolved at import time via cohort overrides):

```
show_chatbot = stage.config.chatbot === true
```

The `<AI_ASSISTANT_BUTTON>` placeholder in markdown content controls button placement. If not present, button renders at the top of the page.

### File Deduplication in Chat Logs

When a file is uploaded to the LLM during chat:
1. Compute SHA-256 of the uploaded file.
2. Compare against hashes of known task files for the current stage (`StageFile.sha256`).
3. If match → store only the filename reference in `ChatFileLog`.
4. If no match → store the full file as base64 + mimetype in `ChatFileLog`.

## Study YAML Format

Studies use inline base stages in study.yaml with cohort overrides. Cohorts are auto-discovered from the `cohorts/` subdirectory.

```
studies/my_study/
├── study.yaml                    # entry point with inline base stages
├── cohorts/
│   ├── ai_trained.yaml           # cohort with stage overrides
│   ├── no_ai_untrained.yaml      # cohort inheriting base as-is
│   └── ...
├── content/
│   ├── intro.md, task1.md, ...   # markdown content for stages
└── files/
    ├── data.csv, template.py     # downloadable task files
```

### study.yaml (entry point with inline stages)

```yaml
id: ai_decision_making
title: "AI-Assisted Decision Making Study"
description: "2x2 design comparing AI access and training"

stages:
  - id: intro
    title: "Welcome & Instructions"
    duration: "5:00"
    content: content/intro.md
    confirmation: "I confirm I have read and understood the instructions."

  - id: task1
    title: "Data Analysis Task"
    duration: "30:00"
    content: content/task1.md
    files:
      - filename: files/data.csv
        description: "Student enrollment and complaint data."
    questions:
      - "Which files are relevant?"
    input:
      label: "Your result"
      prompt: "Explain your reasoning."
    confirmation: "I confirm this is my final answer."

  - id: end
    title: "Thank You"
    duration: "2:00"
    content: content/end.md
```

No `cohorts:` list — all `.yaml` files in `cohorts/` are auto-discovered.

### Cohort YAML (overrides only)

Cohorts inherit all base stages. They only define what differs: overrides, additions, or skips.

```yaml
id: ai_trained
label: "AI Access + Training"
provider: anthropic
model: claude-sonnet-4-20250514
fallback:
  provider: gemini
  model: gemini-2.5-flash

stages:
  - id: training                   # ADD new stage (not in base)
    title: "AI Training"
    duration: "10:00"
    content: content/training.md
    chatbot: true
    after: intro                   # insertion position

  - id: task1                      # OVERRIDE existing stage
    chatbot: true                  # only changed fields
    sidebar_panels:
      - title: "Scenario"
        content: "Context for the task..."
```

Cohort with no changes:

```yaml
id: no_ai_untrained
label: "No AI + No Training"
```

### Override Semantics

| Operation | Syntax | Rules |
|-----------|--------|-------|
| **Override** | Stage `id` matches base | Only specified fields replace base values. Omitted = inherited. |
| **Add** | Stage `id` NOT in base | Must have `after: <id>` or `before: <id>`, plus `title` + `duration`. |
| **Skip** | `skip: true` on base `id` | Removes stage from this cohort's flow. |

Field values replace entirely (no deep merge). Set to `null` (YAML `~`) to explicitly remove a field.

### Provider/Model Resolution

```
1. stage.config.provider/model  →  stage-level override
2. cohort.provider/model        →  default for all chatbot stages
```

Cohort must have `provider`/`model` if any resolved stage has `chatbot: true` (unless that stage has its own).

### `<AI_ASSISTANT_BUTTON>` Placeholder

When a stage has `chatbot: true`:
- If markdown contains `<AI_ASSISTANT_BUTTON>`, the button renders at that position
- If no placeholder, button renders at the top of the page

### YAML Field Reference

**study.yaml:**

| Field | Description |
|-------|-------------|
| `id` | Unique study identifier |
| `title` | Study name |
| `description` | Study description |
| `stages` | Base flow: ordered list of stage definitions |

**Cohort YAML:**

| Field | Description |
|-------|-------------|
| `id` | Unique cohort identifier |
| `label` | Human-readable cohort name |
| `provider` | LLM provider (`anthropic`, `openai`, `gemini`). Required if any stage has chatbot. |
| `model` | Model ID. Required if provider is set. |
| `fallback` | Fallback `{provider, model}` if primary fails |
| `stages` | Optional list of stage overrides/additions/skips |

**Stage fields (base + overrides):**

| Field | Description |
|-------|-------------|
| `id` | Stage identifier (matches base for override, new for addition) |
| `title` | Stage title shown to participant |
| `duration` | Duration as `"MM:SS"` string |
| `content` | Relative path to markdown file |
| `chatbot` | `true`/`false` — show AI chatbot button. Default: `false`. |
| `provider` | Stage-level LLM provider override |
| `model` | Stage-level model override |
| `files` | List of `{filename, description}` — downloadable task files |
| `questions` | List of sub-questions |
| `input` | Text input: `{label, prompt?}`. Omit = no input field. |
| `confirmation` | Confirmation checkbox text |
| `sidebar_panels` | Chat sidebar panels: `[{title, content, defaultExpanded?}]` |
| `skip` | `true` to remove this base stage (cohort overrides only) |
| `after` | Insert after this stage ID (new stages only) |
| `before` | Insert before this stage ID (new stages only) |

### MD Content Files

Markdown files serve as rich content for stages. They are rendered to participants during the corresponding stage. Use `<AI_ASSISTANT_BUTTON>` to place the chatbot button inline. Use `<USER_ID>` as a template variable replaced with the participant's identifier at runtime.

## Design System (from Figma)

Reference: [Figma file](https://www.figma.com/design/RXjJLcWy3VKcykA44Hr3UL/AI-Match?m=dev)

### Layout
- **Schedule sidebar** (left, ~362px, sticky): lists all stages with status indicators and durations
- **Content area** (right, remaining width): stage title (H1), sections (H2), body text, files, input, submit
- Vertical divider line between sidebar and content

### Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| Sidebar background | `#fffff9` | Schedule panel background |
| Heading text | `#152509` | H1, H2, H3 headings |
| Body text | `rgba(0,0,0,0.8)` | Paragraph text, lists |
| Muted text | `#cfcbbe` | Completed stage names, durations |
| Active button bg | `#324624` | Submit button (enabled) |
| Active button text | `#ffffff` | Submit button label |
| Inactive button bg | `#cfcbbe` | Submit button (disabled, before confirmation) |
| Inactive button text | `#535353` | Disabled button label |
| Input border | `#495e39` | Text input area border |
| Link color | `blue` | External links, file download links |
| Page background | `#ffffff` | Main content area |

### Typography
- **Font family**: Inter
- **H1**: 36px, Regular, `#152509`
- **H2**: 22px, Regular, `#152509`
- **H3**: 15px, Semi Bold, `#152509`
- **Body**: 14px, Medium, `rgba(0,0,0,0.8)`, line-height 1.5, tracking -0.154px
- **Schedule title**: 24px, Regular, `#152509`
- **Schedule items**: 16px, Regular, black (active) or `#cfcbbe` strikethrough (completed)
- **Schedule durations**: 16px, Regular, `#cfcbbe`

### Stage Status Indicators (Schedule sidebar)
- **Completed**: grey filled circle, text is `#cfcbbe` with strikethrough
- **In progress**: green filled circle, text is black
- **Upcoming**: open/hollow circle, text is black

### Button Behavior
- Submit button starts **inactive** (beige `#cfcbbe`, grey text)
- Becomes **active** (dark green `#324624`, white text) only after the confirmation checkbox is checked
- Button text: "Submit your answer and proceed"

### Stage Layout Variants (from Figma)
1. **Instruction + input + chatbot** (fullest): Scenario section, Data description with file links, Tasks list, AI Chatbot section, sub-questions, input field, confirmation, submit
2. **Instruction + input** (no chatbot): Same layout but without AI Chatbot section
3. **Instruction only** (e.g., survey): Title, description, external link, confirmation, submit (no input field)

## Key Behaviors

### Participant Flow
1. Participant launches the Electron app on a lab machine.
2. Enters their identifier (pre-generated 4-word code like `stern-satin-karma-unity`).
3. App loads their assigned study session, cohort, and current progress.
4. App fetches the cohort's stages from DB and renders them in order.
5. Each stage displays:
   - **Schedule sidebar** (left): all stages with completion status, current stage highlighted
   - **Content area** (right): stage title (H1), MD content rendered as sections, downloadable files with descriptions, sub-questions, optional AI Chatbot link, optional text input, confirmation checkbox, submit button
6. Timer counts down. The submit button **only appears after the timer expires**.
7. Submit button starts **inactive** — becomes active only after the confirmation checkbox is checked.
8. Participant checks the confirmation and clicks "Submit your answer and proceed".
9. Progress is saved to PostgreSQL after each stage transition.
10. Schedule sidebar updates: completed stages get strikethrough + grey dot, next stage becomes active.

### Chatbot
- Uses `ucl-study-llm-chat-api` Conversation class for multi-turn chat.
- Supports sandboxed code execution (Python/bash) via provider containers.
- Provider/model resolution: stage config → cohort default → error.
- If primary provider fails, falls back to cohort's fallback provider.
- Chat turns are logged to PostgreSQL (`ChatLog` table).
- File uploads are deduplicated against known task files (see File Deduplication above).
- Chatbot shown when `stage.config.chatbot === true` (resolved per-cohort at import time).

### Study Sessions
A study definition can be run multiple times. Each run is a `StudySession` with its own participants and collected data.

### Local Preview Mode
Researchers can preview the participant experience from just the YAML + MD files, without database or network. The app loads the YAML, renders each cohort's stages, and lets the researcher click through as any cohort. This is for validating study design before deploying.

## CLI Scripts (Researcher Tools)

| Command | Description |
|---------|-------------|
| `import-study <path-to-study-dir>` | Validates 3-level YAML hierarchy and imports study + cohorts + stages into DB |
| `create-session <study-id>` | Creates a new session for a study |
| `generate-participants <session-id> --count N --cohort <cohort-id>` | Bulk-creates participants with 4-word identifiers |
| `export-results <session-id>` | Exports all data for a session (progress, chat logs, files) |
| `preview-study <path-to-study-dir>` | Launches app in preview mode for a study |

**Prisma Studio** (`npx prisma studio`) provides a web-based GUI for browsing and editing all database tables directly — the equivalent of Django admin.

## Development Guidelines

### Project Structure (target)
```
ucl-study-manager/
├── electron/              # Electron main process
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/              # IPC handlers
├── src/                   # Next.js renderer
│   ├── app/              # App router pages
│   ├── components/       # React components
│   │   ├── stages/       # Stage display components
│   │   ├── chat/         # Chat interface (assistant-ui)
│   │   ├── timer/        # Countdown timer
│   │   └── ui/           # shadcn/ui components
│   ├── lib/              # Utilities, YAML parsing, DB queries
│   └── api/              # API routes (Next.js)
├── prisma/
│   └── schema.prisma     # Database schema
├── cli/                   # CLI scripts for researchers
├── studies/               # Example study definitions
│   └── example/
│       ├── study.yaml
│       ├── cohorts/      # Cohort definitions
│       ├── flows/        # Stage sequences
│       ├── content/      # Markdown files
│       └── files/        # Task files
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

### Conventions
- TypeScript strict mode throughout.
- Use Prisma for all database access — no raw SQL.
- **No copying code** from sibling projects. Import `ucl-study-llm-chat-api` and `ucl-study-llm-chat-frontend` as npm packages (git SSH). If either needs new exports, request changes in that project.
- Reuse `ucl-study-llm-chat-api` Conversation class — do not reimplement provider logic.
- Import chat UI components and stream-mapper from `ucl-study-llm-chat-frontend` (once restructured as a package).
- Keep Electron main process thin: it handles app lifecycle, file system access, and IPC. All business logic lives in the Next.js renderer or shared lib.

### Database
- Scaleway Serverless PostgreSQL.
- Prisma ORM with `npx prisma db push` for schema sync.
- Connection string in `.env` as `DATABASE_URL`.
- API keys for LLM providers are managed via the key pool in `ucl-study-llm-chat-api` (stored in the same PostgreSQL instance).

### Environment Variables

**Admin** (CLI tools, researcher machine only — never on participant machines):
```
DATABASE_URL=postgresql://...        # Scaleway serverless PostgreSQL (admin IAM credentials)
```

**Participant app** (Electron, embedded at build time):
```
PARTICIPANT_DB_URL=postgresql://...   # Limited-privilege DB user (SELECT study data, INSERT logs, no DELETE)
```

The `PARTICIPANT_DB_URL` credential is injected at Electron build time and embedded in the packaged app. It is **never committed to the repo**. The `.gitignore` includes `.env` and any build-time credential files.

### Security Model

The Electron app ships with a **single limited-privilege database credential** that can:
- SELECT study structure (stages, files, cohorts)
- SELECT API keys via `assign_api_key()` SECURITY DEFINER function (keys never exposed directly)
- INSERT chat logs, file logs, and participant progress
- UPDATE `completed_at` and `input_answer` on participant progress

It **cannot**:
- DELETE any data
- UPDATE study definitions, participants, or API keys
- Access the admin tables directly
- See other participants' chat logs (enforced via RLS)

**Known limitation:** The DB credential is embedded in the Electron binary. A technically skilled participant on a lab machine could theoretically extract it. The credential is intentionally limited in scope — the worst case is inserting extra chat log entries. This is an accepted trade-off for avoiding the complexity of a separate API server. The lab environment (university-controlled machines, supervised sessions) mitigates this risk.

Participants authenticate in the app with their **3-word identifier + 6-word password**. These are looked up against the `participants` table to determine their cohort, stages, and progress. The identifier/password are NOT database credentials — they are application-level auth checked against the DB.
