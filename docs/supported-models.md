# Supported LLM Models

The study manager uses the `ucl-study-llm-chat-api` SDK which supports three providers. Each provider offers **sandboxed code execution** (Python/bash) so participants can ask the AI to run code, generate plots, and analyze data.

## Provider & Model Reference

### Anthropic (Claude)

| Model ID | Description | Code Execution |
|----------|-------------|----------------|
| `claude-sonnet-4-5-20250929` | **Default.** Best balance of speed and capability. | Yes (sandboxed bash) |
| `claude-sonnet-4-5-20250514` | Previous Sonnet release. | Yes |
| `claude-sonnet-4-6-20260217` | Latest Sonnet. | Yes |
| `claude-opus-4-5-20251124` | Most capable, slower. | Yes |
| `claude-opus-4-6-20260205` | Latest Opus. | Yes |
| `claude-haiku-4-5-20251001` | Fastest, cheapest. Good for simple tasks. | Yes |

**Tool:** `code_execution_20250825` — runs bash commands in a persistent sandboxed container. Files persist across turns within a conversation.

### OpenAI (GPT)

| Model ID | Description | Code Execution |
|----------|-------------|----------------|
| `gpt-5` | **Default.** Latest flagship model. | Yes (code_interpreter) |
| `gpt-4o` | Previous generation, still capable. | Yes |
| `gpt-4o-mini` | Smaller, faster, cheaper. | Yes |

**Tool:** `code_interpreter` — runs Python in a sandboxed container. Can generate files (plots, CSVs). Files persist across turns.

**Known limitation:** OpenAI's streaming API sends code execution results only after the full response completes (not inline). This means all tool calls appear as "running" simultaneously and complete at once. Anthropic and Gemini send results inline.

### Google (Gemini)

| Model ID | Description | Code Execution |
|----------|-------------|----------------|
| `gemini-2.5-flash` | **Default.** Fast, good for most tasks. | Yes (codeExecution) |
| `gemini-2.5-pro` | More capable, slower. | Yes |
| `gemini-2.0-flash` | Previous generation. | Yes |

**Tool:** `codeExecution` — runs Python code. **Ephemeral sandboxes** — files do NOT persist across turns (unlike Anthropic/OpenAI). Each code execution gets a fresh environment.

## How to Configure

### In the study YAML (cohort definition)

```yaml
# cohorts/ai_trained.yaml
id: ai_trained
label: "Claude Group"
ai_access: true
ai_training: true
provider: anthropic                    # "anthropic" | "openai" | "gemini"
model: claude-sonnet-4-5-20250929      # optional, uses provider default if omitted
fallback:
  provider: openai
  model: gpt-4o
study_flow: flows/with_training.yaml
```

### In the database (via CLI)

```bash
# Add API key for a provider, linked to specific cohorts
npx tsx cli/add-api-key.ts anthropic "sk-ant-..." 1 2
npx tsx cli/add-api-key.ts openai "sk-proj-..." 3 4
npx tsx cli/add-api-key.ts gemini "AIzaSy..." 5 6

# Change a cohort's provider
npx tsx -e "
import {PrismaClient} from '@prisma/client';
const p = new PrismaClient();
await p.cohort.update({where:{id:5}, data:{provider:'openai', model:'gpt-4o'}});
await p.\$disconnect();
"
```

## Provider Comparison

| Feature | Anthropic | OpenAI | Gemini |
|---------|-----------|--------|--------|
| Code execution | Bash (persistent container) | Python (persistent container) | Python (ephemeral) |
| File persistence across turns | Yes | Yes | No |
| Streaming tool results | Inline | Deferred (end of stream) | Inline |
| File upload to sandbox | Yes | Yes | Yes (base64 inline) |
| Web search | Available (separate tool) | Available | Not via SDK |

## Pricing Notes

Costs vary significantly by model. For research studies with many participants:

- **Gemini 2.5 Flash** is the cheapest option with good capability
- **Claude Haiku** is fast and affordable
- **GPT-4o-mini** is OpenAI's budget option
- **Opus / GPT-5** are the most capable but most expensive

The key pool system load-balances across multiple API keys per provider, which helps distribute costs and avoid rate limits.
