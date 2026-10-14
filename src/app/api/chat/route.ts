import { generateText, tool, isStepCount } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { applyServerGuards, catalog, isArabic } from "@/lib/guards";

const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  // Groq rejects `reasoning_content` on assistant messages (the SDK echoes it back
  // between tool-call steps with reasoning models), so strip it from the request.
  fetch: async (url, init) => {
    if (typeof init?.body === "string") {
      try {
        const json = JSON.parse(init.body);
        if (Array.isArray(json.messages)) {
          for (const m of json.messages) {
            delete m.reasoning_content;
            delete m.reasoning;
          }
          init = { ...init, body: JSON.stringify(json) };
        }
      } catch {
        /* leave body untouched */
      }
    }
    return fetch(url, init);
  },
});
const MODEL = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";

/** Infer relevant quick-reply buttons from the bot's question when the LLM omits `choices`. */
/** Infer relevant quick-reply buttons from the bot's question when the LLM omits `choices`. */
function inferContextualChoices(replyText: string, arabic: boolean): string[] | undefined {
  // Inspect only the actual question part (last sentence / around the question mark)
  // so acknowledgements like "درجتك مناسبة" don't trigger the IELTS rule on a language question.
  const lines = replyText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const questionLine =
    [...lines].reverse().find((l) => l.includes("?") || l.includes("؟")) ??
    lines[lines.length - 1] ??
    replyText;
  const t = questionLine.toLowerCase();

  // 1. Teaching language question (check first)
  if (/taught in|teaching language|prefer.*language|لغة التدريس|لغة الدراسة|بالعربية أم|بأي لغة/.test(t)) {
    return arabic
      ? ["الإنجليزية", "العربية", "لا أفرق"]
      : ["English", "Arabic", "Either is fine"];
  }
  // 2. IELTS / English level question
  if (/ielts|آيلتس|ايلتس|إنجليزي|انجليزي|english level|score|درجتك في|مستواك/.test(t)) {
    return arabic
      ? ["5.5 أو أقل", "6.0 - 6.5", "لا يوجد آيلتس"]
      : ["5.5 or lower", "6.0 - 6.5", "No IELTS yet"];
  }
  // 3. Budget / tuition fee question
  if (/budget|tuition|fee|cost|ميزاني|تكلف|رسوم/.test(t)) {
    return arabic
      ? ["أقل من 2500", "2500 - 4500", "أكثر من 4500"]
      : ["Under 2500", "2500 - 4500", "Over 4500"];
  }
  // 4. Field of interest question
  if (/field|interest|study|مجال|تخصص|دراست/.test(t)) {
    return arabic
      ? ["الحوسبة", "الهندسة", "الطب"]
      : ["Computing", "Engineering", "Medicine"];
  }
  return undefined;
}

/** Extract the first JSON object from model text, or strip trailing ["a","b"] arrays from prose. */
function parseReply(text: string, arabic: boolean): {
  replyText?: string;
  choices?: unknown;
  recommendedProgramIds?: unknown;
} {
  // Strip <think>...</think> blocks and markdown code fences
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  // 1. Try parsing a full JSON object {...}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      const rawReply =
        typeof obj.replyText === "string"
          ? obj.replyText
          : typeof obj.reply === "string"
          ? obj.reply
          : typeof obj.message === "string"
          ? obj.message
          : "";
      // Also strip any trailing ["..."] array if the model put one inside replyText
      const replyText = rawReply.replace(/\s*\[(?:\s*"[^"]*"\s*,?)+\]\s*$/, "").trim();
      const rawChoices = obj.choices ?? obj.options ?? obj.buttons ?? obj.quickReplies;
      const choices =
        Array.isArray(rawChoices) && rawChoices.length > 0
          ? rawChoices
          : inferContextualChoices(replyText, arabic);
      return {
        replyText,
        choices,
        recommendedProgramIds: obj.recommendedProgramIds ?? obj.programIds ?? [],
      };
    } catch {
      /* fall through to lenient parsing */
    }
  }

  // 2. Check if the model wrote prose followed by a bare JSON array like: ["أقل من 2500", "2500 - 4500"]
  let trailingChoices: string[] | undefined;
  const trailingArrayMatch = cleaned.match(/(\[(?:\s*"[^"]+"\s*,?\s*)+\])\s*$/);
  if (trailingArrayMatch) {
    try {
      const parsedArr = JSON.parse(trailingArrayMatch[1]);
      if (Array.isArray(parsedArr) && parsedArr.every((x) => typeof x === "string")) {
        trailingChoices = parsedArr;
        cleaned = cleaned.slice(0, trailingArrayMatch.index).trim();
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Lenient key-value parsing: "replyText: ...\nchoices: [..]\nrecommendedProgramIds: [..]"
  const reply = cleaned.match(/replyText\s*:\s*([\s\S]*?)(?=\n\s*choices\s*:|$)/i);
  const arr = (key: string): string[] | undefined => {
    const m = cleaned.match(new RegExp(`${key}\\s*:\\s*(\\[[\\s\\S]*?\\])`, "i"));
    if (!m) return undefined;
    try {
      return JSON.parse(m[1]);
    } catch {
      return undefined;
    }
  };

  // Also extract any P01..P14 IDs mentioned in prose if the model forgot recommendedProgramIds
  const mentionedIds = [...new Set((cleaned.match(/\bP(?:0[1-9]|1[0-4])\b/g) ?? []))];

  const finalReply = (reply ? reply[1] : cleaned)
    .replace(/\*\*/g, "") // clean markdown bold stars for cleaner plain bubbles
    .replace(/^["']|["']$/g, "")
    .trim();

  const parsedChoices =
    arr("choices") ?? trailingChoices ?? inferContextualChoices(finalReply, arabic);

  return {
    replyText: finalReply,
    choices: parsedChoices,
    recommendedProgramIds: arr("recommendedProgramIds") ?? mentionedIds,
  };
}

export const maxDuration = 60;

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1),
  studentFacts: z.record(z.string(), z.string()).default({}),
});

const SYSTEM = `You are Simitai, a friendly study-abroad programme advisor for high-school students.
Rules:
- Reply in Arabic if the student's language is Arabic, otherwise English.
- Before recommending anything, gather: field of interest, budget, English/IELTS level, preferred teaching language. Ask ONLY ONE question per message.
- Call saveStudentFact whenever the student reveals a fact (keys: interest, budget, ielts, language).
- Only recommend programmes returned by searchCatalog. Never invent programmes or IDs. Put recommended IDs (e.g. "P01") in recommendedProgramIds, only when actually recommending; otherwise [].
- Every reply must include 1-3 short quick-reply choices (each at most 20 characters) that directly answer your question.
- Your FINAL message must be plain assistant text (NOT a tool call) containing ONLY a valid JSON object (double-quoted keys), no markdown, in every language including Arabic. Example: {"replyText":"What is your budget?","choices":["Under 2500","2500-4500","Over 4500"],"recommendedProgramIds":[]}`;

export async function POST(req: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const studentFacts: Record<string, string> = { ...body.studentFacts };

  // Find the last user message that actually contains letters (so numeric buttons like "3000-5000" or "6-6.5" don't reset Arabic to English)
  const HAS_LETTERS_RE = /[\p{L}]/u;
  const lastLetterUserMsg = [...body.messages]
    .reverse()
    .find((m) => m.role === "user" && HAS_LETTERS_RE.test(m.content));
  const lastUser =
    lastLetterUserMsg ?? [...body.messages].reverse().find((m) => m.role === "user");
  const arabic = isArabic(lastUser?.content ?? "");

  try {
    const run = async (extra: string) =>
      (
        await generateText({
          model: groq.chatModel(MODEL),
          system: `${SYSTEM}\nKnown student facts: ${JSON.stringify(studentFacts)}\nRequired response language for this turn: ${arabic ? "Arabic (العربية) ONLY — including replyText and all choices" : "English ONLY — including replyText and all choices"}.${extra}`,
          messages: body.messages,
          tools: {
            searchCatalog: tool({
              description:
                "Search the programme catalog. All filters optional. Returns matching programmes.",
              inputSchema: z.object({
                field: z.string().optional(),
                maxFee: z.number().optional(),
                teachingLanguage: z.enum(["en", "ar"]).optional(),
                minIelts: z
                  .number()
                  .optional()
                  .describe("Student's IELTS score; returns programmes requiring at most this"),
                scholarship: z.boolean().optional(),
              }),
              execute: async ({ field, maxFee, teachingLanguage, minIelts, scholarship }) =>
                catalog.filter(
                  (p) =>
                    (field === undefined || p.field.toLowerCase() === field.toLowerCase()) &&
                    (maxFee === undefined || p.fee <= maxFee) &&
                    (teachingLanguage === undefined || p.teaching_language === teachingLanguage) &&
                    (minIelts === undefined || p.min_ielts === null || p.min_ielts <= minIelts) &&
                    (scholarship === undefined || p.scholarship === scholarship),
                ),
            }),
            saveStudentFact: tool({
              description:
                "Save a key-value fact about the student (interest, budget, ielts, language).",
              inputSchema: z.object({ key: z.string(), value: z.string() }),
              execute: async ({ key, value }) => {
                studentFacts[key] = value;
                return { saved: true, key, value };
              },
            }),
          },
          stopWhen: isStepCount(8),
        })
      ).text;

    let parsed = parseReply(await run(""), arabic);
    if (!Array.isArray(parsed.choices) || parsed.choices.length === 0) {
      parsed = parseReply(
        await run(
          `\nIMPORTANT: your previous answer had no "choices". Include 1-3 relevant quick replies that directly answer your question (e.g. budget ranges for a budget question). Respond in ${arabic ? "Arabic only" : "English only"}.`,
        ),
        arabic,
      );
    }

    return Response.json({
      ...applyServerGuards(parsed as Parameters<typeof applyServerGuards>[0], catalog, arabic),
      studentFacts,
    });
  } catch (err) {
    console.error("chat error", err);
    return Response.json({
      replyText: arabic
        ? "الخدمة مشغولة حالياً (ربما بسبب حد الاستخدام). يرجى المحاولة بعد قليل."
        : "The service is busy right now (possibly a rate limit). Please try again in a moment.",
      choices: [arabic ? "إعادة المحاولة" : "Try again"],
      recommendedProgramIds: [],
      studentFacts,
    });
  }
}