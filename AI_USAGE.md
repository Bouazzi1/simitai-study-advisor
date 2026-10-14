# AI Usage

## Tools
Antigravity (agentic coding assistant) with Claude Sonnet, used for scaffolding the guards, tests, API route and chat UI, and for debugging against live provider errors.

## What the AI got wrong, and how we noticed
1. **Bilingual welcome message in the model history.** The first version sent the UI's static English/Arabic greeting to the API as an assistant message. We noticed because the bot replied in both languages even when the student wrote only in Arabic.
2. **"Yes / No" ("نعم / لا") as fallback buttons.** When the model returned no choices, the guard filled in Yes/No. We noticed in a real chat where the bot asked "What's the maximum tuition budget…?" and the buttons were Yes / No — nonsensical for an open question.
3. **Guard only checked `P##` IDs in `replyText`.** It did not catch an invented programme or university name written in prose, which the spec requires. We noticed while reviewing the guard against the spec ("every programme ID or name mentioned").

Other issues the AI hit along the way and had to debug from real errors: a retired Gemini model, a free-tier quota exhausted by multi-step tool calls, a TLS certificate failure from local HTTPS interception, Groq rejecting `reasoning_content`, and `gpt-oss` emitting a fake `json` tool call.

## How we fixed and rewrote it
- Excluded the static welcome bubble from the model context.
- Added a lenient parser for structured choices and one retry when `choices` is missing.
- Replaced the Yes/No fallback with open-ended defaults (`Flexible / Not sure yet / Start over`, and the Arabic equivalents).
- Hardened the catalog guard: it now also rejects institution/programme-like names in `replyText` that are not in `catalog.json`, with unit tests (34 passing).
