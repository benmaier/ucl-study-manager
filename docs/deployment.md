# Deployment: Vercel + Neon PostgreSQL

This guide covers deploying the UCL Study Manager from scratch on Vercel with Neon PostgreSQL.

## Prerequisites

- A [Vercel](https://vercel.com) account
- A [Neon](https://neon.tech) account (free tier works, EU regions available)
- Node.js 18+ installed locally
- The repository cloned locally

## 1. Create a Neon database

1. Sign in to [Neon Console](https://console.neon.tech).
2. Create a new project. Choose an **EU region** if required (e.g. `eu-central-1` for Frankfurt).
3. Copy the connection string from the dashboard. It looks like:
   ```
   postgresql://user:password@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Save this as your `DATABASE_URL`.

## 2. Set up the database

Create a `.env` file locally:

```bash
cp .env.example .env
# Paste your Neon DATABASE_URL into .env
```

Push the Prisma schema to create all tables:

```bash
npx prisma db push
```

Set up the API key pool tables (these are not managed by Prisma):

```bash
npx tsx cli/run-sql.ts sql/setup.sql
```

Verify with Prisma Studio:

```bash
npx prisma studio
```

## 3. Import your study

```bash
npx tsx cli/import-study.ts studies/my_study/
```

Note the study ID printed in the output (e.g. `Study ID: 1`).

## 4. Create a session and generate participants

```bash
# Create a session
npx tsx cli/create-session.ts 1 --label "First run"

# Generate participants per cohort (use cohort IDs from your YAML)
npx tsx cli/generate-participants.ts 1 --count 25 --cohort ai_trained
npx tsx cli/generate-participants.ts 1 --count 25 --cohort no_ai_untrained

# Generate a test user for yourself
npx tsx cli/generate-participants.ts 1 --count 1 --cohort ai_trained --test
```

Save the credential output -- passwords cannot be recovered after generation.

## 5. Add API keys

For cohorts with AI access, add API keys to the key pool. You need the **numeric database ID** of each cohort (find it in Prisma Studio, or in the import output).

```bash
# Anthropic key for cohorts 5 and 6
npx tsx cli/add-api-key.ts anthropic sk-ant-api03-... 5 6

# OpenAI key for cohort 6
npx tsx cli/add-api-key.ts openai sk-proj-... 6

# Gemini key for cohort 5
npx tsx cli/add-api-key.ts gemini AIzaSy... 5
```

You can add multiple keys per provider for load balancing.

## 6. Deploy to Vercel

### Option A: Via GitHub (recommended)

1. Push the repo to GitHub.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard) and import the GitHub repo.
3. In the project settings, add the environment variable:
   - `DATABASE_URL` = your Neon connection string
4. Deploy.

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Link to a Vercel project
vercel link

# Set the DATABASE_URL in Vercel
vercel env add DATABASE_URL
# Paste your Neon connection string when prompted
# Select all environments (Production, Preview, Development)

# Deploy to preview
vercel deploy

# Deploy to production
vercel deploy --prod
```

### Vercel project settings

These are configured automatically, but verify:

- **Framework Preset**: Next.js
- **Build Command**: `prisma generate && next build` (set in package.json)
- **Node.js Version**: 18.x or 20.x

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | No | Fallback if DB key pool is not set up |
| `OPENAI_API_KEY` | No | Fallback if DB key pool is not set up |
| `GOOGLE_API_KEY` | No | Fallback if DB key pool is not set up |

The DB key pool is the primary way to manage API keys. The environment variable fallbacks are only used if no key is found in the pool.

## 7. Verify the deployment

1. Open the deployment URL.
2. Log in with a test user's credentials.
3. Verify:
   - Study stages load correctly in the sidebar.
   - Timer counts down.
   - On chatbot stages, "Open AI Assistant" opens chat in a new tab.
   - Sending a message in chat gets an AI response.
   - Completing a stage advances to the next one.
4. Log in with a non-AI cohort user to verify chatbot is hidden.

## Updating the study

If you modify the study YAML files:

```bash
# Re-import (idempotent -- updates existing records)
npx tsx cli/import-study.ts studies/my_study/
```

Then redeploy (the study definition is read from the database, so a redeploy is not strictly necessary unless you changed application code).

## Updating the app

If you change application code:

```bash
# If using GitHub: push to trigger auto-deploy
git push origin main

# If using Vercel CLI:
vercel deploy --prod
```

## Vendored dependencies

Two private npm packages are vendored as tarballs in `vendor/`:

- `ucl-chat-widget-*.tgz` -- Chat UI widget
- `ucl-study-llm-chat-api-*.tgz` -- LLM conversation SDK

These are included because Vercel cannot clone private GitHub repositories during `npm install`. To update them:

1. Build the package in its source repo (`npm run build`).
2. Pack it (`npm pack`).
3. Repack without `prepare` script and `devDependencies`:
   ```bash
   mkdir /tmp/repack && cd /tmp/repack
   tar xzf /path/to/package-x.y.z.tgz
   # Edit package/package.json: remove "scripts" and "devDependencies"
   tar czf /path/to/ucl-study-manager/vendor/package-x.y.z.tgz package
   ```
4. Update `package.json` to point to the new tarball version.
5. Run `npm install`.

## Database maintenance

### After a database reset

If you reset or recreate the Neon database, you need to re-run the full setup:

```bash
# 1. Recreate Prisma tables
npx prisma db push

# 2. Recreate key pool tables
npx tsx cli/run-sql.ts sql/setup.sql

# 3. Re-import study
npx tsx cli/import-study.ts studies/my_study/

# 4. Re-create session and participants
npx tsx cli/create-session.ts 1
npx tsx cli/generate-participants.ts 1 --count 25 --cohort ai_trained
# ... etc

# 5. Re-add API keys
npx tsx cli/add-api-key.ts anthropic sk-ant-... 5 6
```

### Prisma Studio

Browse and edit the database directly:

```bash
npx prisma studio
```

Opens a web UI at `http://localhost:5555`. Useful for:
- Finding numeric cohort IDs (needed for `add-api-key`).
- Checking participant progress.
- Debugging stage configurations.
- Viewing chat logs.

### Exporting data

```bash
npx tsx cli/export-results.ts <session-id> --output-dir ./exports
```

Exports JSON + CSV files with all progress, responses, and chat transcripts. See the [README](../README.md#export-results) for details on output format.

## Troubleshooting

### "Key pool error" in chat

The key pool tables (`api_keys`, `cohort_key_pools`, `session_key_assignments`) and the `assign_api_key()` function are not managed by Prisma. If you ran `prisma db push` without also running `sql/setup.sql`, they won't exist.

Fix:
```bash
npx tsx cli/run-sql.ts sql/setup.sql
npx tsx cli/add-api-key.ts <provider> <key> <cohort-ids...>
```

### Chat not available

The chatbot only appears when all of these are true:
- The stage has `chatbot: true` in its config.
- The cohort has `ai_access: true`.
- The participant has started but not completed the stage.

### Neon cold starts

Neon's free tier suspends the database after 5 minutes of inactivity. The first request after suspension takes 1-3 seconds longer. This is normal and only affects the first participant to log in after a period of inactivity.

### Build fails on Vercel

Common causes:
- Missing `DATABASE_URL` environment variable.
- Vendored tarball has a `prepare` script that tries to run `tsup` (strip it during repacking).
- TypeScript errors in new code (run `npm run build` locally first).
