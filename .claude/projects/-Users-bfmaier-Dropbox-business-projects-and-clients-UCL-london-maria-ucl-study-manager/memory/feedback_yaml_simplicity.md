---
name: YAML design preferences
description: User wants minimal, general-purpose YAML format — no redundant listings, inline where possible, no domain-specific flags
type: feedback
---

1. Don't list items explicitly when they can be auto-discovered (e.g. cohorts from a directory).
2. Don't create separate files when content can be inlined (base flow belongs in study.yaml, not a separate file).
3. Don't add domain-specific boolean flags (ai_access, ai_training) — keep the format general-purpose. AI chatbot access is a per-stage property controlled via stage overrides in cohorts.
4. Use markdown placeholders (like `<AI_ASSISTANT_BUTTON>`) for dynamic UI elements rather than config flags.

**Why:** The format should be as general as possible so it works for any kind of study, not just AI-focused ones. Researchers shouldn't need to understand implementation details.

**How to apply:** When designing YAML schemas or config formats, favor convention-over-configuration, auto-discovery, and inline definitions over references. Minimize the number of concepts a researcher needs to learn.
