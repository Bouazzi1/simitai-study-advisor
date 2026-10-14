# Simitai Study Advisor

Bilingual (Arabic / English) study-programme advisor chatbot. Built with Next.js (App Router), the Vercel AI SDK, and Groq. The bot asks **one question at a time**, records student facts in a sidebar, offers quick-reply buttons, and only recommends programmes that exist in `src/data/catalog.json` (enforced by deterministic server guards).

## Install

```bash
npm install
```

## Configure

Create `.env.local` in the project root:

```env
GROQ_API_KEY=your_groq_key_here
# optional (default shown)
GROQ_MODEL=qwen/qwen3.8-27b
```

`.env*` is git-ignored — never commit your key.

## Run

```bash
npm run dev
```

Open http://localhost:3000.

> **TLS errors on some Windows networks** (`unable to verify the first certificate`, usually caused by antivirus/proxy HTTPS interception): start the server with the system certificate store:
>
> ```powershell
> $env:NODE_OPTIONS="--use-system-ca"; npm run dev
> ```

## Test

```bash
npx vitest run
```

Unit tests for the server guards (`src/lib/__tests__/guards.test.ts`) run without any LLM calls.

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Chat UI, profile sidebar, quick replies, automatic RTL/LTR |
| `src/app/api/chat/route.ts` | `POST /api/chat`: `generateText` with `searchCatalog` + `saveStudentFact` tools |
| `src/lib/guards.ts` | Deterministic guards (≤3 choices, ≤20 chars, catalog ID/name verification) |
| `src/data/catalog.json` | The 14 programmes (P01–P14) |

See [DECISIONS.md](DECISIONS.md) and [AI_USAGE.md](AI_USAGE.md).
