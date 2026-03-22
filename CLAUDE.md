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
| `Study`             | Imported from study.yaml. Title, description, global fallback provider/model.            |
| `Cohort`            | Experimental condition. ID, label, `aiAccess`, `aiTraining` booleans, provider/model/fallback. Each cohort has its own stages from its flow YAML. |
| `Stage`             | Ordered phase within a cohort's flow. Title, duration, content, `chatbot` boolean, questions, input config, link, confirmation. Belongs to Cohort. |
| `StageFile`         | Downloadable task file with description and SHA-256 hash. Belongs to Stage.              |
| `StudySession`      | A run of a study with a specific set of participants. Links to Study.                    |
| `Participant`       | 4-word identifier (e.g., `stern-satin-karma-unity`), assigned Cohort + StudySession.     |
| `ParticipantProgress`| Tracks `started_at`, `completed_at` per stage per participant.                          |
| `ChatLog`           | Conversation turns: role, content, provider, model, token counts. Belongs to Participant.|
| `ChatFileLog`       | File refs in chat. Known task files stored as filename (hash match), unknown files stored as base64 + mimetype blob. |

### Chatbot Visibility

No join table needed. Simple boolean check:

```
show_chatbot = stage.chatbot === true AND cohort.aiAccess === true
```

### File Deduplication in Chat Logs

When a file is uploaded to the LLM during chat:
1. Compute SHA-256 of the uploaded file.
2. Compare against hashes of known task files for the current stage (`StageFile.sha256`).
3. If match → store only the filename reference in `ChatFileLog`.
4. If no match → store the full file as base64 + mimetype in `ChatFileLog`.

## Study YAML Format

Studies use a 3-level YAML hierarchy. All paths are relative to the study directory.

```
studies/my_study/
├── study.yaml                    # entry point
├── cohorts/
│   ├── ai_trained.yaml           # cohort definition → points to flow
│   ├── ai_untrained.yaml
│   ├── no_ai_trained.yaml
│   └── no_ai_untrained.yaml
├── flows/
│   ├── with_training.yaml        # stage sequence for trained cohorts
│   ├── standard.yaml             # stage sequence shared by multiple cohorts
│   └── no_ai_with_training.yaml  # no-AI variant with training stage
├── content/
│   ├── intro.md, task1.md, ...   # markdown content for stages
└── files/
    ├── data.csv, template.py     # downloadable task files
```

### study.yaml (entry point)

```yaml
title: "Code Assistance Study"
description: "Comparing LLM-assisted coding across providers"

fallback:
  provider: openai
  model: gpt-4o

cohorts:
  - cohorts/ai_trained.yaml
  - cohorts/ai_untrained.yaml
  - cohorts/no_ai_trained.yaml
  - cohorts/no_ai_untrained.yaml
```

### Cohort YAML

Defines a cohort's experimental condition and points to its study flow.

```yaml
id: ai_trained
label: "AI Access + AI Training"
ai_access: true
ai_training: true
provider: anthropic
model: claude-sonnet-4-20250514
fallback:
  provider: openai
  model: gpt-4o
study_flow: flows/with_training.yaml
```

Cohorts with `ai_access: false` must NOT have `provider`/`model`:

```yaml
id: no_ai_untrained
label: "No AI + No Training"
ai_access: false
ai_training: false
study_flow: flows/standard.yaml
```

### Flow YAML (stage sequence)

Defines the ordered stages a cohort goes through. Multiple cohorts can share the same flow.

```yaml
stages:
  - id: intro
    title: "Welcome & Instructions"
    duration: "10:00"
    content: content/intro.md
    confirmation: "I confirm I have read and understood the instructions."

  - id: ai_training
    title: "AI Tool Training"
    duration: "15:00"
    content: content/ai_training.md
    chatbot: true

  - id: task1
    title: "Data Analysis Task"
    duration: "30:00"
    content: content/task1.md
    chatbot: true
    files:
      - filename: files/data.csv
        description: "Student enrollment and complaint data from 1998-2003."
      - filename: files/template.py
        description: "Python template with analysis functions to complete."
    questions:
      - "Which files are relevant and which are irrelevant or unusable?"
      - "Did the number of complaints decrease after the campaign?"
      - "Do you think the campaign was successful?"
    input:
      label: "Your result"
      prompt: "Explain why you reached these conclusions."
    confirmation: "I confirm this is my final answer and I'm aware I won't be able to edit it after submitting."

  - id: survey
    title: "Post-Study Survey"
    duration: "10:00"
    content: content/survey.md
    link:
      label: "Open the survey"
      url: "https://example.com/survey"
    confirmation: "I confirm I completed the survey linked above."
```

### YAML Field Reference

**study.yaml:**

| Field | Description |
|-------|-------------|
| `title` | Study name |
| `description` | Study description |
| `fallback` | Global fallback `{provider, model}` if cohort's provider is down |
| `cohorts` | List of relative paths to cohort YAML files |

**Cohort YAML:**

| Field | Description |
|-------|-------------|
| `id` | Unique cohort identifier |
| `label` | Human-readable cohort name |
| `ai_access` | `true`/`false` — whether this cohort gets chatbot on chatbot-enabled stages |
| `ai_training` | `true`/`false` — whether this cohort receives pre-study AI training |
| `provider` | LLM provider: `anthropic`, `openai`, or `google`. Required if `ai_access: true`. |
| `model` | Model ID. Required if `ai_access: true`. |
| `fallback` | Per-cohort fallback `{provider, model}` |
| `study_flow` | Relative path to the flow YAML for this cohort |

**Flow YAML (stages):**

| Field | Description |
|-------|-------------|
| `stages[].id` | Unique stage identifier within this flow |
| `stages[].title` | Stage title shown to participant |
| `stages[].duration` | Duration as `"MM:SS"` string |
| `stages[].content` | Relative path to markdown file |
| `stages[].chatbot` | `true`/`false` — show chatbot for `ai_access` cohorts. Default: `false`. |
| `stages[].files` | List of `{filename, description}` objects — downloadable task files |
| `stages[].questions` | List of sub-questions in the "Submit your answer" section |
| `stages[].input` | Text input config: `{label, prompt?}`. Omit = no input field. |
| `stages[].link` | External link: `{label, url}`. For stages that redirect elsewhere (surveys). |
| `stages[].confirmation` | Text for the confirmation checkbox. Must be checked before submit. |

### MD Content Files

Markdown files serve as rich content for stages: instructions, task descriptions, reading material, survey prompts, etc. They are rendered to participants during the corresponding stage.

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
- Provider and model determined by participant's **cohort** assignment.
- If primary provider fails, automatically falls back to cohort's fallback provider, then to the study's global fallback.
- Chat turns are logged to PostgreSQL (`ChatLog` table).
- File uploads are deduplicated against known task files (see File Deduplication above).
- Chatbot only shown when `stage.chatbot === true AND cohort.aiAccess === true`.

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
