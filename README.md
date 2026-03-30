# UCL Study Manager

A web application for running timed research studies with optional LLM chatbot access. Researchers define studies using YAML files, assign participants to experimental cohorts, and collect structured data (stage progress, text responses, and full chat transcripts).

Built with Next.js, Prisma, and PostgreSQL. Deployed on Vercel with Neon.

## How it works

1. **Researchers** define a study as a set of YAML files (study definition, cohorts, stage flows, markdown content, task files).
2. The study is **imported** into a PostgreSQL database via CLI.
3. A **session** is created for a particular run of the study.
4. **Participants** are generated with unique credentials and assigned to cohorts.
5. Participants **log in** via a web browser, and are guided through timed stages.
6. Some cohorts get access to an **AI chatbot** (Claude, OpenAI, or Gemini) during certain stages.
7. All data (progress, responses, chat logs) is stored in the database and can be **exported** via CLI.

## Table of contents

- [Study setup](#study-setup)
  - [Directory structure](#directory-structure)
  - [study.yaml](#studyyaml)
  - [Cohort YAML](#cohort-yaml)
  - [Flow YAML](#flow-yaml)
  - [Markdown content](#markdown-content)
  - [Task files](#task-files)
  - [Template variables](#template-variables)
- [CLI reference](#cli-reference)
  - [Import a study](#import-a-study)
  - [Create a session](#create-a-session)
  - [Generate participants](#generate-participants)
  - [Add API keys](#add-api-keys)
  - [Export results](#export-results)
- [Participant experience](#participant-experience)
- [API key pool](#api-key-pool)
- [Supported providers and models](#supported-providers-and-models)
- [Local development](#local-development)
- [Deployment](#deployment)

---

## Study setup

### Directory structure

A study is defined as a directory with a fixed structure:

```
my_study/
├── study.yaml              # Entry point
├── cohorts/
│   ├── ai_trained.yaml     # One file per cohort
│   └── no_ai.yaml
├── flows/
│   ├── with_training.yaml  # Stage sequences (can be shared across cohorts)
│   └── standard.yaml
├── content/
│   ├── intro.md            # Markdown shown to participants during stages
│   ├── task1.md
│   └── survey.md
└── files/
    ├── data.csv            # Downloadable task files
    └── template.py
```

### study.yaml

The entry point. Defines the study title and lists all cohorts.

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

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Study name |
| `description` | No | Study description |
| `fallback` | No | Global fallback `{provider, model}` if a cohort's primary provider fails |
| `cohorts` | Yes | List of relative paths to cohort YAML files |

### Cohort YAML

Each cohort is an experimental condition. It defines whether participants get AI access and which LLM provider/model to use.

**With AI access:**

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

**Without AI access:**

```yaml
id: no_ai_untrained
label: "No AI + No Training"
ai_access: false
ai_training: false
study_flow: flows/standard.yaml
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique cohort identifier (used in CLI commands) |
| `label` | Yes | Human-readable name |
| `ai_access` | Yes | `true`/`false` -- whether participants see the chatbot |
| `ai_training` | Yes | `true`/`false` -- metadata flag for experimental design |
| `provider` | If `ai_access: true` | `anthropic`, `openai`, or `gemini` |
| `model` | If `ai_access: true` | Model ID (e.g. `claude-sonnet-4-20250514`, `gpt-4o`, `gemini-2.5-flash`) |
| `fallback` | No | Per-cohort fallback `{provider, model}` |
| `study_flow` | Yes | Relative path to the flow YAML for this cohort |

Cohorts with `ai_access: false` must **not** have `provider` or `model` set.

Multiple cohorts can share the same `study_flow`.

### Flow YAML

Defines the ordered sequence of stages a cohort goes through. This is the core of the study design.

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
        description: "Student enrollment and complaint data."
      - filename: files/template.py
        description: "Python template with analysis functions."
    questions:
      - "Which files are relevant?"
      - "Did complaints decrease after the campaign?"
      - "Was the campaign successful?"
    input:
      label: "Your result"
      prompt: "Explain why you reached these conclusions."
    confirmation: "I confirm this is my final answer."

  - id: survey
    title: "Post-Study Survey"
    duration: "10:00"
    content: content/survey.md
    link:
      label: "Open the survey"
      url: "https://example.com/survey"
    confirmation: "I confirm I completed the survey."
```

#### Stage field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique stage identifier within this flow |
| `title` | Yes | Stage title shown to participant |
| `duration` | Yes | Duration as `"MM:SS"` string. Timer counts down from this. |
| `content` | No | Relative path to a markdown file rendered as stage content |
| `chatbot` | No | `true` to enable chatbot (only shown if cohort has `ai_access: true`). Default: `false` |
| `files` | No | List of `{filename, description}` -- downloadable task files |
| `questions` | No | List of sub-questions displayed in the task section |
| `input` | No | Text input config: `{label, prompt?}`. Adds a textarea with auto-save. |
| `link` | No | External link: `{label, url}`. Opens in a new tab. |
| `confirmation` | No | Confirmation checkbox text. Must be checked before submit. |

#### Stage behavior

- The **timer** starts counting down when the participant enters the stage.
- The **submit button** is disabled until the timer expires.
- If `confirmation` is set, the button stays disabled until the checkbox is also checked.
- If `input` is set, the text is **auto-saved** every 2 seconds while typing.
- If `chatbot: true` and the cohort has `ai_access: true`, an "Open AI Assistant" button appears that opens the chat in a new tab.
- If `link` is set, a clickable link is shown.

### Markdown content

Markdown files in `content/` are rendered to participants during stages. They support standard Markdown plus GitHub Flavored Markdown (tables, strikethrough, etc.).

The first `# H1` heading is hidden (the stage title is already shown). Use `## H2` for sections.

```markdown
# Data Analysis Task

## Scenario

You are assisting a professor in evaluating the outcome of an
anti-discrimination campaign across schools in the US.

## Your Task

Analyze the provided data files and answer the questions below.
```

### Task files

Files in `files/` are made available for download during the stage. Each file is SHA-256 hashed at import time for deduplication in chat logs (if a participant uploads a known task file to the chatbot, only the filename reference is stored, not the full file).

### Template variables

You can use `<USER_ID>` anywhere in markdown content, link URLs, or other stage config strings. It will be replaced with the participant's identifier (e.g. `ranch-coral-ivory`) at render time.

This is useful for linking to external apps that need to identify the participant:

```yaml
link:
  label: "Open Negotiation App"
  url: "https://example.com/app?participantKey=<USER_ID>"
```

---

## CLI reference

All CLI commands require `DATABASE_URL` to be set in `.env`.

### Import a study

Validates the YAML hierarchy and imports everything into the database.

```bash
npx tsx cli/import-study.ts studies/my_study/
```

This is **idempotent** -- running it again updates the existing study. Cohorts no longer referenced in `study.yaml` are removed. Stages are recreated on each import.

The command outputs the study's database ID, which you need for the next step.

### Create a session

A session represents one run of a study. You can run the same study multiple times with different participant groups.

```bash
npx tsx cli/create-session.ts <study-id> [--label "March 2026 Run"]
```

Example:

```bash
npx tsx cli/create-session.ts 1 --label "Pilot run"
# Output: Created session 1 for study "Code Assistance Study"
```

### Generate participants

Creates participants with unique 3-word identifiers and 6-word passwords, assigned to a specific cohort.

```bash
npx tsx cli/generate-participants.ts <session-id> --count <N> --cohort <cohort-id> [--test]
```

- `--cohort` uses the cohort's `id` from the YAML (e.g. `ai_trained`), not the database ID.
- `--test` marks participants as test users (gives them a "skip timer" button and a "reset" button).
- Max 1000 participants per command.

Example:

```bash
npx tsx cli/generate-participants.ts 1 --count 20 --cohort ai_trained
npx tsx cli/generate-participants.ts 1 --count 20 --cohort no_ai_untrained
npx tsx cli/generate-participants.ts 1 --count 2 --cohort ai_trained --test
```

Output:

```
Generated 20 participants for session 1, cohort "ai_trained":
──────────────────────────────────────────────────────────────
  Username (identifier)       | Password
──────────────────────────────────────────────────────────────
  table-coast-valve            | knack-sugar-stern-steel-vivid-lotus
  ranch-coral-ivory            | sunny-llama-robot-pulse-magic-haven
  ...
```

Save this output -- the passwords are hashed with bcrypt and cannot be recovered.

### Add API keys

API keys for LLM providers are stored in a database key pool. Keys are assigned to cohorts and load-balanced across participants.

First, set up the key pool tables (only needed once after a fresh database):

```bash
npx tsx cli/run-sql.ts sql/setup.sql
```

Then add keys:

```bash
npx tsx cli/add-api-key.ts <provider> <api-key> <cohort-db-id> [cohort-db-id ...]
```

- `provider`: `anthropic`, `openai`, or `gemini`
- `cohort-db-id`: The **numeric database ID** of the cohort (not the YAML id). Find it with `npx prisma studio`.

Example:

```bash
# Add an Anthropic key for cohorts with DB IDs 5 and 6
npx tsx cli/add-api-key.ts anthropic sk-ant-api03-... 5 6

# Add a Gemini key for cohort 5
npx tsx cli/add-api-key.ts gemini AIzaSy... 5
```

You can add multiple keys per provider per cohort for load balancing. The system automatically assigns the least-used key to each participant.

### Export results

Exports all data for a session: participant overview, stage progress with timestamps, chat transcripts, and uploaded files.

```bash
npx tsx cli/export-results.ts <session-id> [--output-dir ./exports]
```

Example:

```bash
npx tsx cli/export-results.ts 1 --output-dir ./exports/pilot
```

Output files:

| File | Contents |
|------|----------|
| `session.json` | Session metadata (study title, participant count, creation date) |
| `participants.json` | Per-participant overview (identifier, cohort, stages completed, chat turn count) |
| `progress.json` | All stage progress records (start/completion times, duration in ms) |
| `progress.csv` | Same as above in CSV format for spreadsheet/stats tools |
| `chat-logs.json` | All chat turns (role, content, provider, model, token counts, file references) |
| `files/` | Unknown files uploaded during chat (base64-decoded), organized by participant and stage |

The `progress.json` and `progress.csv` include computed `durationMs` for each completed stage. The `chat-logs.json` includes token counts for cost analysis.

---

## Participant experience

1. Participant opens the app URL in a browser.
2. Enters their 3-word identifier and 6-word password.
3. Sees the study view:
   - **Left sidebar**: Schedule showing all stages with progress indicators.
   - **Right area**: Current stage content, files, questions, input field, chatbot button, submit.
4. Timer counts down. Submit button activates when the timer expires (and confirmation checkbox is checked, if applicable).
5. Text input is auto-saved every 2 seconds.
6. On chatbot stages, "Open AI Assistant" opens a chat in a new tab. The chat automatically becomes unavailable when the participant moves to a non-chatbot stage.
7. After completing all stages, a "Thank you" screen is shown.

**Test users** additionally see:
- A "Next (skip timer)" button to advance without waiting.
- A "Reset this user" button on the completion screen to start over.

---

## API key pool

API keys are managed in the database, not in environment variables. This allows:

- Multiple keys per provider for load balancing and rate limit distribution.
- Per-cohort key assignment (different cohorts can use different providers).
- Automatic least-used key selection per participant.

The key pool uses a PostgreSQL `SECURITY DEFINER` function (`assign_api_key`) that:
1. Looks up the participant's cohort.
2. Finds the least-used active key for the requested provider in that cohort's pool.
3. Increments the usage counter and logs the assignment.
4. Returns the API key.

Set up the key pool tables after any fresh database:

```bash
npx tsx cli/run-sql.ts sql/setup.sql
```

---

## Supported providers and models

| Provider | Provider string | Example models |
|----------|----------------|----------------|
| Anthropic | `anthropic` | `claude-sonnet-4-20250514`, `claude-opus-4-20250514` |
| OpenAI | `openai` | `gpt-4o`, `gpt-4.1` |
| Google Gemini | `gemini` | `gemini-2.5-flash`, `gemini-2.5-pro` |

All providers support code execution in chat (Python for OpenAI/Gemini, Bash for Anthropic).

See [docs/supported-models.md](docs/supported-models.md) for detailed provider comparison including code execution capabilities and pricing.

---

## Local development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Push Prisma schema to database
npx prisma db push

# Set up key pool tables
npx tsx cli/run-sql.ts sql/setup.sql

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`.

Use `npx prisma studio` to browse the database.

---

## Deployment

See [docs/deployment.md](docs/deployment.md) for a complete guide to deploying on Vercel with Neon PostgreSQL.

---

## Complete workflow example

```bash
# 1. Import your study
npx tsx cli/import-study.ts studies/my_study/
# → Study ID: 1

# 2. Create a session
npx tsx cli/create-session.ts 1 --label "March 2026"
# → Session ID: 1

# 3. Generate participants for each cohort
npx tsx cli/generate-participants.ts 1 --count 25 --cohort ai_trained
npx tsx cli/generate-participants.ts 1 --count 25 --cohort ai_untrained
npx tsx cli/generate-participants.ts 1 --count 25 --cohort no_ai_trained
npx tsx cli/generate-participants.ts 1 --count 25 --cohort no_ai_untrained

# 4. Set up key pool (first time only)
npx tsx cli/run-sql.ts sql/setup.sql

# 5. Add API keys (use numeric cohort DB IDs from prisma studio)
npx tsx cli/add-api-key.ts anthropic sk-ant-... 5 6

# 6. Distribute credentials to participants
#    (save the output from step 3)

# 7. After the study, export data
npx tsx cli/export-results.ts 1 --output-dir ./exports/march-2026
```
