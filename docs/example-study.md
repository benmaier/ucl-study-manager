# Example study

This is a complete, working example of a study definition. It demonstrates all available stage features: timed stages, markdown content, downloadable task files, chatbot access, text input with auto-save, external links, sub-questions, confirmation checkboxes, and template variables.

The study compares how participants perform a data analysis task with and without AI assistance, and with and without prior AI training.

## Directory structure

```
studies/example/
├── study.yaml
├── cohorts/
│   ├── ai_trained.yaml
│   ├── ai_untrained.yaml
│   ├── no_ai_trained.yaml
│   └── no_ai_untrained.yaml
├── flows/
│   ├── with_training.yaml
│   ├── standard.yaml
│   └── no_ai_with_training.yaml
├── content/
│   ├── intro.md
│   ├── ai_training.md
│   ├── task1.md
│   └── survey.md
└── files/
    ├── data.csv
    └── template.py
```

---

## study.yaml

The entry point. References four cohorts representing a 2x2 experimental design (AI access x AI training).

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

---

## Cohort definitions

### cohorts/ai_trained.yaml

Full AI access with a training stage. Uses Anthropic Claude.

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

### cohorts/ai_untrained.yaml

AI access but no training stage. Same provider, different flow.

```yaml
id: ai_untrained
label: "AI Access + No Training"
ai_access: true
ai_training: false
provider: anthropic
model: claude-sonnet-4-20250514
fallback:
  provider: openai
  model: gpt-4o
study_flow: flows/standard.yaml
```

### cohorts/no_ai_trained.yaml

No AI access. Gets the training content but without a working chatbot. Note: no `provider` or `model` fields.

```yaml
id: no_ai_trained
label: "No AI + AI Training"
ai_access: false
ai_training: true
study_flow: flows/no_ai_with_training.yaml
```

### cohorts/no_ai_untrained.yaml

Control group. No AI, no training.

```yaml
id: no_ai_untrained
label: "No AI + No Training"
ai_access: false
ai_training: false
study_flow: flows/standard.yaml
```

---

## Flow definitions

### flows/with_training.yaml

Used by `ai_trained`. Four stages including an AI training phase.

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
      url: "https://example.com/survey?participant=<USER_ID>"
    confirmation: "I confirm I completed the survey linked above."
```

**What each stage demonstrates:**

| Stage | Features used |
|-------|--------------|
| `intro` | Markdown content, confirmation checkbox, no input |
| `ai_training` | Markdown content, chatbot enabled, no confirmation (just a proceed button) |
| `task1` | Markdown content, chatbot, downloadable files, sub-questions, text input (auto-saved), confirmation |
| `survey` | Markdown content, external link with `<USER_ID>` template variable, confirmation |

### flows/standard.yaml

Used by `ai_untrained` and `no_ai_untrained`. Skips the training stage.

```yaml
stages:
  - id: intro
    title: "Welcome & Instructions"
    duration: "10:00"
    content: content/intro.md
    confirmation: "I confirm I have read and understood the instructions."

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
      url: "https://example.com/survey?participant=<USER_ID>"
    confirmation: "I confirm I completed the survey linked above."
```

Note: `task1` has `chatbot: true` in both flows. For `no_ai_untrained` (which has `ai_access: false`), the chatbot button simply won't be shown. This lets you share the same flow across AI and non-AI cohorts.

### flows/no_ai_with_training.yaml

Used by `no_ai_trained`. Same stages as `with_training`, but without `chatbot: true` on any stage.

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

  - id: task1
    title: "Data Analysis Task"
    duration: "30:00"
    content: content/task1.md
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
      url: "https://example.com/survey?participant=<USER_ID>"
    confirmation: "I confirm I completed the survey linked above."
```

---

## Markdown content files

### content/intro.md

```markdown
# Welcome to the Code Assistance Study

Thank you for participating in this research study.

## What to expect

You will complete a series of timed tasks. During some tasks, you may have access
to an AI assistant that can help you with coding questions.

## Guidelines

- Work independently — do not discuss with other participants
- You may use any tools available to you within the app
- Complete each task to the best of your ability within the time limit
- When the timer expires, click "Submit" to proceed to the next stage
```

### content/ai_training.md

```markdown
# AI Tool Training

In this session you will learn how to use the AI assistant.

## How to use the chatbot

The chatbot panel is on the right side of the screen. You can type messages
and the AI will respond.

## Tips

- Be specific in your questions
- You can ask the AI to run code for you
- The AI can help with data analysis, plotting, and debugging
- Always verify the AI's output — it can make mistakes
```

### content/task1.md

```markdown
# Data Analysis Task

## Scenario

You are assisting a professor in evaluating the outcome of an anti-discrimination
campaign across schools in the US conducted for one year in the 2000.

You have access to the professor's data folder to complete the analysis.
Unfortunately, the professor let their kid play with the folder, so it may contain
unnecessary files, and some data files may be corrupted or unreliable.

You **may use the AI tool linked below** to support your work, but you are
responsible for verifying results, producing plots, and clearly explaining your
reasoning. You can also use excel, python, web browser or any other tool, but you
may not discuss with anyone else. There are trick questions.
```

### content/survey.md

```markdown
# Post-Study Survey

Please complete the self-evaluation survey linked below. The survey should take
approximately 10 minutes.
```

---

## Task files

These are the files participants can download during the `task1` stage. They are also used for chat deduplication: if a participant uploads one of these files to the AI chatbot, the system recognizes it by its SHA-256 hash and stores only a reference instead of the full file.

### files/data.csv

```csv
id,name,score,group,date
1,Alice,85,A,2024-01-15
2,Bob,92,B,2024-01-15
3,Charlie,78,A,2024-01-16
4,Diana,95,B,2024-01-16
5,Eve,88,A,2024-01-17
```

### files/template.py

```python
"""Data Analysis Template — complete the functions below."""
import pandas as pd

def load_data(filepath: str) -> pd.DataFrame:
    # TODO: Implement
    pass

def summary_statistics(df: pd.DataFrame) -> dict:
    # TODO: return mean, median, std, min, max
    pass

if __name__ == "__main__":
    df = load_data("data.csv")
    print("Summary:", summary_statistics(df))
```

---

## Importing and running this example

```bash
# Import the study
npx tsx cli/import-study.ts studies/example/
# → Study "Code Assistance Study" imported (ID: 1)
#   4 cohorts, 3-4 stages each

# Create a session
npx tsx cli/create-session.ts 1 --label "Test run"

# Generate participants
npx tsx cli/generate-participants.ts 1 --count 5 --cohort ai_trained
npx tsx cli/generate-participants.ts 1 --count 5 --cohort ai_untrained
npx tsx cli/generate-participants.ts 1 --count 5 --cohort no_ai_trained
npx tsx cli/generate-participants.ts 1 --count 5 --cohort no_ai_untrained

# Generate a test user (skip-timer button, reset button)
npx tsx cli/generate-participants.ts 1 --count 1 --cohort ai_trained --test

# Set up key pool and add an API key
npx tsx cli/run-sql.ts sql/setup.sql
npx tsx cli/add-api-key.ts anthropic sk-ant-api03-... 5 6
# (5 and 6 are the DB IDs of ai_trained and ai_untrained cohorts — check prisma studio)

# Export results after the study
npx tsx cli/export-results.ts 1 --output-dir ./exports/test-run
```

---

## Design notes

**Why separate flows from cohorts?** Multiple cohorts can share the same flow file. In this example, `ai_untrained` and `no_ai_untrained` both use `standard.yaml`. The chatbot visibility is controlled by the cohort's `ai_access` flag, not by the flow. This avoids duplicating stage definitions.

**Why `chatbot: true` on stages in a no-AI flow?** You can include `chatbot: true` in a shared flow used by both AI and non-AI cohorts. The chatbot button only appears if `stage.chatbot === true AND cohort.ai_access === true`. For non-AI cohorts, it's silently ignored. However, if you want a cleaner separation, you can create a dedicated flow without `chatbot` flags (like `no_ai_with_training.yaml` in this example).

**File deduplication in chat.** When the study is imported, each file in `files/` is SHA-256 hashed. During chat, if a participant uploads a file matching a known hash, only the filename reference is stored in `chat_file_logs` (not the full file content). Unknown files (e.g. AI-generated plots) are stored as base64 blobs and exported to disk during `export-results`.
