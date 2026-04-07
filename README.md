# UCL Study Manager

A web application for running timed research studies with optional LLM chatbot access. Researchers define studies using YAML files, manage participants via an admin panel, and collect structured data (stage progress, text responses, and full chat transcripts).

Built with Next.js, Prisma, and PostgreSQL. Deployed on Vercel with Neon.

## Table of contents

- [Quick start](#quick-start)
- [Study format](#study-format)
  - [Directory structure](#directory-structure)
  - [study.yaml](#studyyaml)
  - [Cohort YAML](#cohort-yaml)
  - [Override semantics](#override-semantics)
  - [Stage field reference](#stage-field-reference)
  - [Markdown content](#markdown-content)
  - [Template variables](#template-variables)
- [Admin panel](#admin-panel)
  - [Import a study](#import-a-study)
  - [Upload participants CSV](#upload-participants-csv)
  - [Generate test user](#generate-test-user)
  - [Preview](#preview)
  - [Deactivate studies](#deactivate-studies)
- [CLI tools](#cli-tools)
- [Participant experience](#participant-experience)
- [API key pool](#api-key-pool)
- [Local development](#local-development)
- [Deployment to Vercel](#deployment-to-vercel)

---

## Quick start

1. **Create a study** — write YAML files defining your stages and cohorts (see [Study format](#study-format) and `studies/example/` for a fully commented example)
2. **Import it** — zip the study folder and upload via the [admin panel](#admin-panel), or use the CLI
3. **Create participants** — upload a CSV or generate test users via the admin panel
4. **Run the study** — participants log in at the app URL with their credentials
5. **Export data** — use the CLI to export progress, responses, and chat logs

---

## Study format

### Directory structure

```
my_study/
├── study.yaml          # Entry point: study metadata + base stages
├── cohorts/            # One .yaml per experimental condition (auto-discovered)
│   ├── control.yaml
│   └── treatment.yaml
├── content/            # Markdown files rendered to participants
│   ├── intro.md
│   └── task.md
└── files/              # Downloadable data files
    └── data.csv
```

### study.yaml

The entry point. Defines the study ID, title, and the **base flow** of stages that all cohorts inherit.

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
        description: "Student enrollment data."
    questions:
      - "Which files are relevant?"
      - "Did complaints decrease after the campaign?"
    input:
      label: "Your analysis"
      prompt: "Explain your findings."
    confirmation: "I confirm this is my final answer."

  - id: end
    title: "Thank You"
    duration: "2:00"
    content: content/end.md
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique study identifier (used in CSV imports and admin panel) |
| `title` | Yes | Study name |
| `description` | No | Study description |
| `stages` | Yes | Base flow: ordered list of stages all cohorts inherit |

Cohort files are **auto-discovered** from the `cohorts/` subdirectory — no need to list them.

### Cohort YAML

Each `.yaml` file in `cohorts/` defines an experimental condition. Cohorts inherit all base stages and only declare what's **different**.

**Cohort with AI chatbot + extra training stage:**

```yaml
id: gemini_trained
label: "Gemini + AI Training"
provider: gemini
model: gemini-2.5-flash
fallback:
  provider: anthropic
  model: claude-haiku-4-5-20251001

stages:
  # ADD a new stage after "intro"
  - id: ai_training
    title: "AI Tool Training"
    duration: "10:00"
    content: content/ai_training.md
    chatbot: true
    after: intro

  # OVERRIDE: enable chatbot on existing task stage
  - id: task1
    chatbot: true
    sidebar_panels:
      - title: "Scenario"
        content: "You are assisting a professor..."
```

**Control cohort (no changes):**

```yaml
id: control
label: "Control Group"
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique cohort identifier |
| `label` | Yes | Human-readable name |
| `provider` | If any stage has `chatbot: true` | LLM provider: `anthropic`, `openai`, `gemini` |
| `model` | If provider is set | Model ID (e.g. `gemini-2.5-flash`) |
| `fallback` | No | Fallback `{provider, model}` if primary fails |
| `stages` | No | List of stage overrides, additions, or skips |

### Override semantics

| Operation | How | Rules |
|-----------|-----|-------|
| **Override** | Use the same `id` as a base stage | Only specified fields change. Omitted fields are inherited. |
| **Add** | Use a new `id` | Must have `after: <stage_id>` or `before: <stage_id>`, plus `title` and `duration`. |
| **Skip** | Set `skip: true` on a base stage `id` | Removes the stage from this cohort's flow. |

- Field values **replace entirely** (no deep merge for arrays/objects).
- Set a field to `null` (YAML `~`) to explicitly remove it from the base.
- Stages can override the cohort's default `provider`/`model` with their own.

See `studies/example/` for a fully commented example with 4 cohorts demonstrating all override types.

### Stage field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique stage identifier |
| `title` | Yes | Shown as page heading |
| `duration` | Yes | Timer duration as `"MM:SS"` |
| `content` | No | Relative path to markdown file |
| `chatbot` | No | `true` to show AI assistant button. Default: `false` |
| `provider` | No | Stage-level LLM provider override |
| `model` | No | Stage-level model override |
| `files` | No | List of `{filename, description}` — downloadable files |
| `questions` | No | Sub-questions displayed before the input field |
| `input` | No | Text input: `{label, prompt?}`. Adds a textarea with auto-save. |
| `link` | No | External link: `{label, url}`. Opens in new tab. |
| `confirmation` | No | Checkbox text. Must be checked before submit. |
| `sidebar_panels` | No | Chat sidebar panels: `[{title, content, defaultExpanded?}]` |
| `skip` | No | `true` to remove this stage (cohort overrides only) |
| `after` | No | Insert after this stage ID (new stages only) |
| `before` | No | Insert before this stage ID (new stages only) |

### Markdown content

Markdown files in `content/` support standard Markdown plus GitHub Flavored Markdown (tables, strikethrough, etc.). The first `# H1` heading is hidden (the stage title is already shown).

Use `<AI_ASSISTANT_BUTTON>` in the markdown to control where the chatbot button appears. If not present, the button renders at the top of the page.

### Template variables

`<USER_ID>` is replaced with the participant's identifier at runtime — in markdown content, link URLs, and all stage config strings.

```yaml
link:
  label: "Open Negotiation App"
  url: "https://example.com/app?participantKey=<USER_ID>"
```

---

## Admin panel

The admin panel is at `/admin` (password-protected). It provides a web interface for all study management tasks.

### Import a study

Drag-and-drop a `.zip` file or study folder onto the drop zone (or click to browse). The study is **validated automatically** — you'll see:

- A summary of all cohorts and their stage counts
- Whether this is a **new study** or an **update** to an existing one
- For updates: a diff showing new, changed, and unchanged cohorts

You can **Preview** the participant experience before importing. Updates require an explicit confirmation step.

### Upload participants CSV

Drag-and-drop a `.csv` file. Format:

```
user,password,study_id,cohort_id
alice-beta-gamma,correct-horse-battery-staple-extra-word,ai_decision_making,gemini_trained
```

The file is validated automatically — the system checks that each study/cohort exists and flags conflicts:

- **New participant** — will be created
- **Existing, same cohort** — password will be updated
- **Existing, different cohort** — will be reassigned (old data preserved)
- **Error** — missing study/cohort, empty fields

Only after reviewing the validation results can you commit the changes.

### Generate test user

Select a study and cohort, click "Generate". Creates a test user with a random 3-word username and 6-word password (shown once — save it). Test users can skip timers and reset their progress.

### Preview

Each cohort in the "Studies & Cohorts" section has a **Preview** link that opens the full participant view in a new tab — browse all stages without logging in as a participant.

### Deactivate studies

Click "Deactivate" on a study to hide it from the active list and dropdowns. Deactivated studies appear in a collapsed section at the bottom and can be re-activated.

---

## CLI tools

All CLI commands require `DATABASE_URL` in `.env`.

### Import a study

```bash
npx tsx cli/import-study.ts studies/my_study/
```

### Validate a study (with interactive preview)

```bash
npx tsx cli/validate-study.ts studies/my_study/
```

Validates the YAML and opens an interactive terminal preview where you can browse cohorts and stages.

### Create a session

```bash
npx tsx cli/create-session.ts <study-db-id> [--label "March 2026"]
```

### Generate participants

```bash
npx tsx cli/generate-participants.ts <session-id> --count <N> --cohort <cohort-id> [--test]
```

Save the output — passwords are hashed and cannot be recovered.

### Add API keys

```bash
# Set up key pool tables (first time only)
npx tsx cli/run-sql.ts sql/setup.sql

# Add a key (global, available to all cohorts)
npx tsx cli/add-api-key.ts anthropic sk-ant-api03-...

# Add a key for specific cohorts (by numeric DB ID)
npx tsx cli/add-api-key.ts gemini AIzaSy... 5 6
```

### Export results

```bash
npx tsx cli/export-results.ts <session-id> [--output-dir ./exports]
```

Exports: session metadata, participant overview, stage progress (JSON + CSV), chat transcripts, and uploaded files.

---

## Participant experience

1. Open the app URL in a browser
2. Enter 3-word username and 6-word password
3. The study view shows a **schedule sidebar** (left) and **content area** (right)
4. Timer counts down per stage. Submit button activates when timer expires and confirmation checkbox is checked
5. Text input auto-saves every 2 seconds
6. On chatbot stages, "Open AI Assistant" opens a chat in a new tab
7. After all stages, the participant is logged out

**Test users** additionally see a "Next (skip timer)" button and a logout/reset option.

---

## API key pool

API keys are stored in the database (not environment variables), enabling:

- Multiple keys per provider for load balancing
- Per-cohort key assignment or global pool
- Automatic least-used key selection

The key pool uses a PostgreSQL `SECURITY DEFINER` function. If no cohort-specific key exists, it falls back to the global pool.

Set up after a fresh database:

```bash
npx tsx cli/run-sql.ts sql/setup.sql
```

---

## Local development

### Prerequisites

- Node.js 22+ (check with `node -v`)
- A PostgreSQL database (local or remote — the CLI tools connect directly)

### Setup

```bash
# Clone the repo
git clone https://github.com/benmaier/ucl-study-manager.git
cd ucl-study-manager

# Install dependencies
npm install

# Set up environment
cp .env.example .env
```

Edit `.env` with your credentials. There are three environment files you may encounter:

**`.env`** — used by the local dev server and all CLI tools:

```bash
# Required: PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Required for admin panel
ADMIN_PASSWORD=local-dev-password

# Optional: LLM API keys for chatbot stages
# Can also be managed via the database key pool (see API key pool section)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIzaSy...
```

**`.env.neon`** — Neon-specific variables (if using the Neon PostgreSQL integration). Typically contains the same `DATABASE_URL` plus Neon-specific variants:

```bash
DATABASE_URL=postgresql://neondb_owner:your-password@your-project.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:your-password@your-project.neon.tech/neondb?sslmode=require
```

**`.env.vercel`** — auto-generated by `vercel env pull`. Contains all Vercel environment variables for local use. Do not commit this file.

```bash
# Generated by vercel env pull
DATABASE_URL=postgresql://...
ADMIN_PASSWORD=...
GOOGLE_API_KEY=...
```

If you're connecting to the existing Neon database (shared with the Vercel deployment), ask the current maintainer for the connection string, or run `vercel env pull .env` to get all variables at once. The CLI tools and the dev server both use `DATABASE_URL` from `.env`.

All `.env*` files are gitignored.

```bash
# Push the Prisma schema to the database (creates/updates tables)
npx prisma db push

# Set up API key pool tables (PostgreSQL functions, only needed once)
npx tsx cli/run-sql.ts sql/setup.sql

# Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. The admin panel is at `http://localhost:3000/admin`.

For the admin panel to work locally, set `ADMIN_PASSWORD` in `.env`:

```
ADMIN_PASSWORD=any-password-you-want-locally
```

### Useful commands

```bash
# Browse the database in a web UI
npx prisma studio

# Validate a study without importing (interactive terminal preview)
npx tsx cli/validate-study.ts studies/example/

# Import a study into the database
npx tsx cli/import-study.ts studies/example/

# Generate test participants
npx tsx cli/create-session.ts <study-db-id> --label "Test"
npx tsx cli/generate-participants.ts <session-id> --count 5 --cohort <cohort-id> --test

# Export all data for a session
npx tsx cli/export-results.ts <session-id> --output-dir ./exports
```

### Complete local workflow

```bash
# 1. Validate your study YAML (browse stages interactively)
npx tsx cli/validate-study.ts studies/my_study/

# 2. Import it
npx tsx cli/import-study.ts studies/my_study/
# → outputs study DB ID and cohort info

# 3. Create a session
npx tsx cli/create-session.ts 1 --label "Local test"
# → outputs session ID

# 4. Generate test participants
npx tsx cli/generate-participants.ts 1 --count 2 --cohort gemini_trained --test
# → outputs usernames and passwords (save these!)

# 5. Add API keys for chat (if testing chatbot stages)
npx tsx cli/add-api-key.ts anthropic sk-ant-api03-...
npx tsx cli/add-api-key.ts gemini AIzaSy...

# 6. Start the server and log in
npm run dev
# Open http://localhost:3000 and use the credentials from step 4

# 7. After testing, export data
npx tsx cli/export-results.ts 1 --output-dir ./exports/test
```

---

## Deployment to Vercel

### What you need from the current maintainer

To work with the existing deployment, you'll need:

| Credential | What it's for |
|------------|---------------|
| **Neon `DATABASE_URL`** | Connect CLI tools and local dev server to the shared database |
| **Vercel team invite** | Deploy to production and manage environment variables |
| **Admin password** | Log in to the `/admin` panel on the deployed app |
| **LLM API keys** (optional) | Test chatbot stages locally (Anthropic, Gemini) |

### Joining the existing deployment

The project is deployed at https://ucl-study-manager.vercel.app. To get access:

1. Ask the current maintainer to invite you to the Vercel team ("benmaier's projects")
2. Install the Vercel CLI: `npm i -g vercel`
3. Log in: `vercel login`
4. Link the project: `vercel link` (select the existing project when prompted)
5. Pull environment variables: `vercel env pull .env` (this gives you the production `DATABASE_URL` for CLI use)

Once linked, you can deploy:

```bash
# Preview deploy (creates a temporary URL)
vercel deploy

# Production deploy (updates ucl-study-manager.vercel.app)
vercel deploy --prod
```

### Setting up a new deployment from scratch

1. Create a Vercel account and a Neon PostgreSQL database
2. Link the repo: `vercel` (follow prompts)
3. Add the Neon integration in Vercel dashboard (auto-sets `DATABASE_URL`)
4. Set environment variables in Vercel dashboard (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Neon integration) |
| `ADMIN_PASSWORD` | Yes | Password for the `/admin` panel (use a high-entropy string) |
| `GOOGLE_API_KEY` | If using Gemini | Google AI API key |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic API key |

5. Deploy: `vercel deploy --prod`
6. After the first deploy, set up the database:

```bash
# Pull the connection string locally
vercel env pull .env

# Push schema
npx prisma db push

# Set up key pool tables
npx tsx cli/run-sql.ts sql/setup.sql

# Add API keys
npx tsx cli/add-api-key.ts anthropic sk-ant-...
npx tsx cli/add-api-key.ts gemini AIzaSy...
```

7. Import a study via the admin panel or CLI, create participants, and you're live.

### After schema changes

If `prisma/schema.prisma` is modified:

```bash
npx prisma db push              # updates tables (may need --accept-data-loss for column drops)
npx tsx cli/run-sql.ts sql/setup.sql  # re-creates key pool functions (dropped by schema push)
npx tsx cli/add-api-key.ts ...  # re-add API keys if key pool tables were recreated
vercel deploy --prod            # deploy the new code
```

### Known issue

GET route handlers in Next.js App Router can silently return 404 on Vercel production. All API routes in this project use POST to work around this. If adding new routes, use POST.
