# Decisions

## What we read to learn the Vercel AI SDK
- The docs bundled in `node_modules/ai/docs` (this SDK version differs from older tutorials): *Generating text* (`generateText`), *Tools and tool calling* (`tool`, `inputSchema`, multi-step with `stopWhen: isStepCount(n)`), and *Generating structured data* (`Output.object` with a Zod schema; note it counts as an extra step when combined with tools).
- The `@ai-sdk/openai-compatible` provider typings (`createOpenAICompatible`), in particular the `fetch` option, which lets us act as request middleware.
- The Next.js docs in `node_modules/next/dist/docs` (App Router route handlers), as `AGENTS.md` requires.

## Main choices and trade-offs

1. **Provider and model.** We tried Google Gemini first: the model we picked was retired for new users, and the free tier (5 requests/min) is exhausted quickly because every tool step is a request. On Groq, `openai/gpt-oss-120b` was unreliable: it often wrapped its final answer in a fake tool call named `json`, failing the request. We settled on **`qwen/qwen3.8-27b` via Groq**: fast, follows the "reply in the student's language" rule well, and calls tools reliably. Trade-off: it is a small model, so we validate everything it returns.
2. **Parsing instead of `Output.object`.** Structured output combined with tool calling is flaky across OpenAI-compatible providers, so the model is told to end with a plain JSON object which we parse (with a lenient fallback for `replyText: ... choices: [...]` output). If `choices` is missing we retry once, then fall back to open-ended defaults.
3. **Custom `fetch` wrapper for Groq reasoning models.** Between tool-call steps the SDK echoes the assistant's `reasoning_content` back, and Groq rejects that field. The wrapper strips it from outgoing messages so multi-step tool calls succeed.
4. **UI greeting excluded from LLM history.** The first bubble is bilingual because the language is unknown. Sending it to the model made it answer in both languages, so the client skips it and the model mirrors only what the student actually wrote.
5. **Deterministic guards over LLM-as-a-judge.** `guards.ts` is plain code: ≤3 choices, ≤20 characters, every recommended ID/name must exist in the catalog, and `P##` IDs or institution-like names in `replyText` must be real. It is free, instant, testable without an LLM (34 unit tests), and cannot be talked out of its rules. Trade-off: the name check is a heuristic (capitalised English phrases ending in words like *University/Camp/Institute*), so it can miss unusual phrasings or Arabic-only fake names; a judge model would be more flexible but slower, costlier and non-deterministic.
6. **Session state on the client.** `studentFacts` travel with each request and come back updated; no database. Simple and stateless, but facts are lost on refresh.

## With more time
- **Currency normalisation.** The catalog mixes 7 currencies (GBP, EUR, QAR, USD, MYR, CAD, NOK), so `maxFee` in `searchCatalog` compares raw numbers across currencies. Convert to one base currency (and keep the student's budget currency) before filtering.
- **Persistent storage** of conversations and student profiles.
- **Streaming UI** for token-by-token replies.
- Arabic-aware fake-name detection, and an end-to-end test suite against a mocked model.
