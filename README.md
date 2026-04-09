# UCL Study Manager

A web application for running timed research studies with optional LLM chatbot access. Researchers define studies using YAML files, manage participants and API keys via an admin panel, and collect structured data (stage progress, text responses, and full chat transcripts).

Built with Next.js, Prisma, and PostgreSQL. Deployed on Vercel with Neon.

---

# For researchers

## Overview

1. **Define a study** as a folder of YAML + markdown files (see [Study format](#study-format))
2. **Upload it** via the admin panel — the system validates it and shows a preview before importing
3. **Add API keys** for LLM providers (Anthropic, OpenAI, Gemini) via the admin panel
4. **Create participants** — upload a CSV or generate test users
5. **Run the study** — participants log in at the app URL with their credentials
6. **Export data** — use the CLI to export progress, responses, and chat logs

## Browsing the database (Prisma Studio)

To inspect study data (participants, progress, chat logs), you can use Prisma Studio — a local web UI for the database:

```bash
git clone https://github.com/benmaier/ucl-study-manager.git
cd ucl-study-manager
npm install
```

Create a `.env` file with the **read-only** database connection string (ask the maintainer):

```bash
DATABASE_URL=postgresql://researcher:<password>@<host>/neondb?sslmode=require
```

Then run:

```bash
npx prisma studio
```

This opens a browser at `http://localhost:5555` where you can browse all tables, filter rows, and follow relationships. The read-only credential ensures you can view but not modify any data.

## Study format

### Directory structure

A study is a folder (zipped for upload) with this structure:

```
my_study/
├── study.yaml          # Study metadata + base stages (the default flow)
├── cohorts/            # One .yaml per experimental condition (auto-discovered)
│   ├── control.yaml
│   └── treatment.yaml
├── content/            # Markdown files rendered to participants
│   ├── intro.md
│   └── task.md
└── files/              # Downloadable data files
    └── data.csv
```

See `studies/example/` in this repo for a fully commented example with 4 cohorts.

### study.yaml

The entry point. Defines the study ID, title, and the **base flow** of stages that all cohorts inherit by default.

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
      - "Did complaints decrease?"
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

Cohort files are **auto-discovered** from the `cohorts/` subdirectory — you don't list them anywhere.

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

**Control cohort (inherits base flow unchanged):**

```yaml
id: control
label: "Control Group"
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique cohort identifier |
| `label` | Yes | Human-readable name |
| `provider` | If any stage has `chatbot: true` | LLM provider: `anthropic`, `openai`, `gemini` |
| `model` | If provider is set | Model ID (e.g. `gemini-2.5-flash`, `claude-haiku-4-5-20251001`) |
| `fallback` | No | Fallback `{provider, model}` if primary fails |
| `stages` | No | List of stage overrides, additions, or skips |

### How overrides work

| Operation | How | Rules |
|-----------|-----|-------|
| **Override** | Use the same `id` as a base stage | Only specified fields change. Everything else is inherited. |
| **Add** | Use a new `id` not in the base | Must have `after: <stage_id>` or `before: <stage_id>`, plus `title` and `duration`. |
| **Skip** | Set `skip: true` on a base stage `id` | Removes the stage from this cohort's flow. |

- Field values **replace entirely** (arrays and objects are not merged).
- Set a field to `null` (YAML `~`) to explicitly remove it from the base.
- Stages can override the cohort's default `provider`/`model` with their own.

### Stage fields

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
| `confirmation` | No | Checkbox text. Must be checked before submit. |
| `sidebar_panels` | No | Chat sidebar panels: `[{title, content, defaultExpanded?}]` |
| `skip` | No | `true` to remove this stage (cohort overrides only) |
| `after` | No | Insert after this stage ID (new stages only) |
| `before` | No | Insert before this stage ID (new stages only) |

### Markdown content

Markdown files in `content/` support standard Markdown plus GitHub Flavored Markdown (tables, strikethrough, etc.). The first `# H1` heading is hidden (the stage title is already shown as the page heading).

**Special placeholders:**

- `<AI_ASSISTANT_BUTTON>` — controls where the chatbot button appears in the content. If not present and `chatbot: true`, the button renders at the top of the page.
- `<USER_ID>` — replaced at runtime with the participant's identifier. Use it in links to pass the participant ID to external apps:

```markdown
[Open the survey](https://example.com/survey?user=<USER_ID>)
```

## Admin panel

The admin panel is at `/admin` (password-protected). It provides a web UI for all study management tasks.

### Import a study

Drag-and-drop a `.zip` file or study folder onto the drop zone (or click to browse). The study is **validated automatically** and you'll see:

- A summary of all cohorts and their stage counts
- Whether this is a **new study** or an **update** to an existing one
- For updates: a diff showing new, changed, and unchanged cohorts

Click **Preview** to browse the full participant experience in a new tab before importing. Updates require an explicit confirmation step.

### API keys

Add LLM API keys for Anthropic, OpenAI, and Gemini directly in the admin panel. Keys are stored in a database pool and automatically load-balanced across participants. You can add multiple keys per provider, disable/enable individual keys, and delete them.

### Upload participants CSV

Drag-and-drop a `.csv` file with columns: `user,password,study_id,cohort_id`.

The file is validated automatically — the system checks that each study and cohort exists, flags duplicate usernames, and shows per-row status before you confirm:

- **New participant** — will be created
- **Existing, same cohort** — password will be updated
- **Existing, different cohort** — will be reassigned (old data preserved)
- **Error** — missing study/cohort, empty fields

### Generate test user

Select a study and cohort, click "Generate". Creates a test user with a random 3-word username and 6-word password (shown once — save it). Test users can skip timers and reset their progress.

### Preview

Each cohort in the "Studies & Cohorts" section has a **Preview** link that opens the full participant view in a new tab.

### Deactivate studies

Click "Deactivate" to hide a study from the active list and dropdowns. Deactivated studies appear in a collapsed section and can be re-activated.

## What participants see

1. Open the app URL in a browser
2. Enter their 3-word username and 6-word password
3. A **schedule sidebar** (left) shows all stages with progress indicators
4. The **content area** (right) shows the current stage: instructions, files, questions, input field, and chatbot button
5. Timer counts down per stage — the submit button activates when the timer expires and the confirmation checkbox is checked
6. Text input auto-saves every 2 seconds
7. On chatbot stages, "Open AI Assistant" opens a full chat interface in a new tab
8. After completing all stages, the participant is logged out

**Test users** additionally see a "Next (skip timer)" button and a logout/reset option.

---

# For developers

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), React, Tailwind CSS |
| Backend | Next.js API routes (POST only — see [known issues](#known-issues)) |
| Database | PostgreSQL (Neon) via Prisma ORM |
| Chat | [ucl-study-llm-chat-api](https://github.com/benmaier/ucl-study-llm-chat-api) (SDK) + [ucl-chat-widget](https://github.com/benmaier/ucl-study-llm-chat-ui) (UI) |
| Deployment | Vercel |

## Local development

### Prerequisites

- Node.js 22+
- A PostgreSQL database (local or the shared Neon instance)

### Setup

```bash
git clone https://github.com/benmaier/ucl-study-manager.git
cd ucl-study-manager
npm install
cp .env.example .env
```

Edit `.env`:

```bash
# Required: PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Required: admin panel password (any string for local dev)
ADMIN_PASSWORD=local-dev-password
```

If connecting to the shared Neon database, ask the current maintainer for the connection string, or run `vercel env pull .env` if you have Vercel access.

```bash
# Push schema to database
npx prisma db push

# Set up API key pool tables (once per fresh database)
npx tsx cli/run-sql.ts sql/setup.sql

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`. Admin panel at `http://localhost:3000/admin`.

All `.env*` files are gitignored.

### CLI tools

All CLI commands use `DATABASE_URL` from `.env`.

```bash
# Validate a study (interactive terminal preview)
npx tsx cli/validate-study.ts studies/example/

# Import a study into the database
npx tsx cli/import-study.ts studies/example/

# Create a session for a study
npx tsx cli/create-session.ts <study-db-id> [--label "Pilot"]

# Generate participants
npx tsx cli/generate-participants.ts <session-id> --count <N> --cohort <cohort-id> [--test]

# Add API keys to the database pool
npx tsx cli/add-api-key.ts anthropic sk-ant-...
npx tsx cli/add-api-key.ts gemini AIzaSy...
npx tsx cli/add-api-key.ts openai sk-proj-...

# Export all data for a session
npx tsx cli/export-results.ts <session-id> [--output-dir ./exports]

# Browse the database
npx prisma studio
```

### API key management

API keys are stored in a PostgreSQL key pool (not environment variables). The pool supports:

- Multiple keys per provider for load balancing
- Per-cohort key assignment or global pool (available to all cohorts)
- Automatic least-used key selection per participant

Keys can be managed via the admin panel UI or the CLI. The key pool tables are created by `sql/setup.sql` and use a `SECURITY DEFINER` function for secure key assignment.

**Important:** If you run `npx prisma db push --accept-data-loss`, the key pool tables (not managed by Prisma) will be dropped. Re-run `npx tsx cli/run-sql.ts sql/setup.sql` and re-add your API keys afterward.

## Deployment to Vercel

### Joining the existing deployment

To work with the existing deployment at https://ucl-study-manager.vercel.app:

| What you need | Who needs it | Why |
|---------------|-------------|-----|
| **Read-only `DATABASE_URL`** | Researchers | Browse data via Prisma Studio |
| **Admin password** | Researchers | Access the `/admin` panel |
| **Full `DATABASE_URL`** | Developers | CLI tools, local dev server |
| **Vercel team invite** | Developers | Deploy and manage environment variables |

Steps:

1. Get invited to the Vercel team by the current maintainer
2. `npm i -g vercel && vercel login`
3. `vercel link` (select the existing project)
4. `vercel env pull .env` (gets `DATABASE_URL` and `ADMIN_PASSWORD`)
5. `npm install`
6. `npm run dev` — local dev server using the production database

To deploy:

```bash
vercel deploy          # preview
vercel deploy --prod   # production
```

### Setting up a new deployment

1. Create a Vercel account and a Neon PostgreSQL database
2. Clone the repo, run `vercel` to create a new project
3. Add the Neon integration in Vercel dashboard (auto-sets `DATABASE_URL`)
4. Set `ADMIN_PASSWORD` in Vercel dashboard (Settings → Environment Variables) — use a high-entropy string
5. Deploy: `vercel deploy --prod`
6. Set up the database:

```bash
vercel env pull .env
npx prisma db push
npx tsx cli/run-sql.ts sql/setup.sql
```

7. Add API keys via the admin panel (or CLI), import a study, and create participants

### Environment variables on Vercel

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Neon) |
| `ADMIN_PASSWORD` | Yes | Password for the `/admin` panel |

API keys for LLM providers (Anthropic, OpenAI, Gemini) are managed in the database via the admin panel — **not** as Vercel environment variables.

### After schema changes

```bash
npx prisma db push                       # may need --accept-data-loss for column drops
npx tsx cli/run-sql.ts sql/setup.sql     # re-create key pool + researcher role (dropped by schema push)
# Re-add API keys via admin panel or CLI
vercel deploy --prod
```

Note: `sql/setup.sql` creates the `researcher` read-only database role automatically. The password is set to a placeholder — change it after first run:

```sql
ALTER ROLE researcher WITH PASSWORD 'your-secure-password';
```

Then give researchers a connection string using that role: `postgresql://researcher:<password>@<host>/neondb?sslmode=require`

## Known issues

- **GET route handlers return 404 on Vercel.** All API routes in this project use POST. If adding new routes, use POST.
- **`prisma db push --accept-data-loss` drops the key pool tables** (they're raw SQL, not Prisma-managed). Always re-run `sql/setup.sql` and re-add API keys afterward.

## License

Apache 2.0 — Copyright University College London (UCL). See [LICENSE](LICENSE).
