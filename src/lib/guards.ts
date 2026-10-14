import rawCatalog from "../data/catalog.json";

export type Programme = {
  id: string;
  name_en: string;
  name_ar: string;
  field: string;
  host: string;
  country: string;
  teaching_language: string;
  weeks: number;
  fee: number;
  currency: string;
  min_ielts: number | null;
  scholarship: boolean;
};

export type BotResponse = {
  replyText: string;
  choices: string[];
  recommendedProgramIds: string[];
};

export const MAX_CHOICES = 3;
export const MAX_CHOICE_LENGTH = 20;

export const catalog: Programme[] = rawCatalog as Programme[];

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/;

export function isArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Resolve a model-provided ID or name to a catalog programme (or undefined). */
export function resolveProgramme(
  idOrName: string,
  cat: Programme[] = catalog,
): Programme | undefined {
  const key = normalize(String(idOrName ?? ""));
  if (!key) return undefined;
  return cat.find(
    (p) =>
      p.id.toLowerCase() === key ||
      normalize(p.name_en) === key ||
      normalize(p.name_ar) === key,
  );
}

/** Find programme IDs written in text (P01..P99-style) that are not in the catalog. */
export function findUnknownIdsInText(
  text: string,
  cat: Programme[] = catalog,
): string[] {
  const known = new Set(cat.map((p) => p.id.toUpperCase()));
  const found = text.match(/\bP\d{2,3}\b/gi) ?? [];
  return [...new Set(found.map((s) => s.toUpperCase()))].filter(
    (id) => !known.has(id),
  );
}

/** Truncate to <= 20 characters (by code point), adding an ellipsis when cut. */
export function sanitizeChoice(choice: string): string {
  const clean = String(choice ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= MAX_CHOICE_LENGTH) return clean;
  return chars.slice(0, MAX_CHOICE_LENGTH - 1).join("").trimEnd() + "…";
}

export function sanitizeChoices(choices: unknown): string[] {
  if (!Array.isArray(choices)) return [];
  const out: string[] = [];
  for (const c of choices) {
    if (typeof c !== "string") continue;
    const s = sanitizeChoice(c);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_CHOICES) break;
  }
  return out;
}

export function fallbackResponse(arabic: boolean): BotResponse {
  return arabic
    ? {
        replyText:
          "عذراً، لم أتمكن من التحقق من هذا البرنامج. هل يمكنك إخبارني بمجال اهتمامك لأقترح عليك برامج مناسبة؟",
        choices: ["الحوسبة", "الطب", "الأعمال"],
        recommendedProgramIds: [],
      }
    : {
        replyText:
          "Sorry, I couldn't verify that programme. Could you tell me your field of interest so I can suggest suitable programmes?",
        choices: ["Computing", "Medicine", "Business"],
        recommendedProgramIds: [],
      };
}

export function defaultChoices(arabic: boolean): string[] {
  return arabic
    ? ["مرن / مفتوح", "لست متأكداً", "البدء من جديد"]
    : ["Flexible", "Not sure yet", "Start over"];
}

const ORG_KEYWORDS =
  "University|Institute|College|School|Academy|Camp|Bootcamp|Seminar|Lab|Studio|Intensive|Workshop|Course|Programme|Program";
const LEADING_STOPWORDS = new Set(
  [
    "i", "we", "the", "a", "an", "try", "consider", "recommend", "suggest", "check", "also",
    "maybe", "look", "perhaps", "great", "for", "at", "and", "or", "with", "our", "visit",
    "join", "choose", "how", "about", "what", "this", "that", "here", "there", "it", "is",
    "are", "in", "on", "to", "of", "by", "from", "my", "your", "if", "so", "then", "but",
    "nice", "good", "sure", "yes", "no", "ok", "okay", "thanks", "hello", "hi",
  ],
);

/**
 * Find programme/institution-like names in text (e.g. "Oxford University",
 * "Quantum Robotics Camp") that do not appear in the catalog as a programme
 * name or host. Heuristic, English only: capitalised words ending in an
 * institution/programme keyword.
 */
export function findUnknownNamesInText(
  text: string,
  cat: Programme[] = catalog,
): string[] {
  const known = cat.flatMap((p) => [normalize(p.name_en), normalize(p.host)]);
  const re = new RegExp(
    `(?:[A-Z][\\w'’-]*\\s+){0,4}(?:${ORG_KEYWORDS})\\b`,
    "g",
  );
  const unknown: string[] = [];
  for (const m of text.matchAll(re)) {
    const words = m[0].trim().split(/\s+/);
    while (words.length > 1 && LEADING_STOPWORDS.has(words[0].toLowerCase())) {
      words.shift();
    }
    if (words.length < 2) continue; // bare keyword, e.g. "School", is not a name
    const candidate = normalize(words.join(" "));
    if (!known.some((k) => k.includes(candidate))) unknown.push(words.join(" "));
  }
  return [...new Set(unknown)];
}

/**
 * Deterministic guard applied to every model response before it reaches the client.
 * - Max 3 choices, each <= 20 chars (at least 1 choice is always returned).
 * - Every recommended ID/name must exist in the catalog; IDs mentioned in the
 *   text must too. Any hallucination => safe fallback message.
 */
export function applyServerGuards(
  response: Partial<BotResponse> | null | undefined,
  cat: Programme[] = catalog,
  fallbackArabic = false,
): BotResponse {
  const replyText =
    typeof response?.replyText === "string" ? response.replyText.trim() : "";
  const arabic = isArabic(replyText);

  if (!replyText) return fallbackResponse(false);

  const recommended = Array.isArray(response?.recommendedProgramIds)
    ? response!.recommendedProgramIds!
    : [];

  const ids: string[] = [];
  for (const r of recommended) {
    const p = typeof r === "string" ? resolveProgramme(r, cat) : undefined;
    if (!p) return fallbackResponse(arabic);
    if (!ids.includes(p.id)) ids.push(p.id);
  }

  if (
    findUnknownIdsInText(replyText, cat).length > 0 ||
    findUnknownNamesInText(replyText, cat).length > 0
  ) {
    return fallbackResponse(arabic);
  }

  let choices = sanitizeChoices(response?.choices);
  if (choices.length === 0) choices = defaultChoices(arabic);

  return { replyText, choices, recommendedProgramIds: ids };
}
