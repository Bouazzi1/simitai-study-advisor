import { describe, it, expect } from "vitest";
import {
  applyServerGuards,
  sanitizeChoice,
  sanitizeChoices,
  resolveProgramme,
  findUnknownIdsInText,
  isArabic,
  findUnknownNamesInText,
  catalog,
} from "../guards";

describe("catalog", () => {
  it("has 14 programmes P01-P14", () => {
    expect(catalog).toHaveLength(14);
    expect(catalog[0].id).toBe("P01");
    expect(catalog[13].id).toBe("P14");
  });
});

describe("sanitizeChoice", () => {
  it("keeps short choices", () => {
    expect(sanitizeChoice("Computing")).toBe("Computing");
  });
  it("keeps exactly 20 chars", () => {
    const s = "a".repeat(20);
    expect(sanitizeChoice(s)).toBe(s);
  });
  it("truncates >20 chars to <=20", () => {
    const out = sanitizeChoice("a".repeat(50));
    expect(Array.from(out).length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });
  it("truncates long Arabic", () => {
    const out = sanitizeChoice("أريد دراسة علوم الحاسوب في المملكة المتحدة");
    expect(Array.from(out).length).toBeLessThanOrEqual(20);
  });
  it("trims whitespace", () => {
    expect(sanitizeChoice("  hi   there ")).toBe("hi there");
  });
});

describe("sanitizeChoices", () => {
  it("limits to 3", () => {
    expect(sanitizeChoices(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c"]);
  });
  it("drops empties, duplicates, non-strings", () => {
    expect(sanitizeChoices(["a", "", "a", 5, " ", "b"])).toEqual(["a", "b"]);
  });
  it("handles non-array", () => {
    expect(sanitizeChoices(undefined)).toEqual([]);
  });
});

describe("resolveProgramme", () => {
  it("resolves by id (case-insensitive)", () => {
    expect(resolveProgramme("p03")?.id).toBe("P03");
  });
  it("resolves by English name", () => {
    expect(resolveProgramme("Young Engineers Lab")?.id).toBe("P02");
  });
  it("resolves by Arabic name", () => {
    expect(resolveProgramme(catalog[3].name_ar)?.id).toBe("P04");
  });
  it("rejects unknown", () => {
    expect(resolveProgramme("P99")).toBeUndefined();
    expect(resolveProgramme("Quantum Wizardry")).toBeUndefined();
    expect(resolveProgramme("")).toBeUndefined();
  });
});

describe("findUnknownIdsInText / isArabic", () => {
  it("finds unknown ids only", () => {
    expect(findUnknownIdsInText("Try P01 and P15 or P99")).toEqual(["P15", "P99"]);
  });
  it("detects Arabic", () => {
    expect(isArabic("مرحبا")).toBe(true);
    expect(isArabic("hello")).toBe(false);
  });
});

describe("applyServerGuards", () => {
  it("passes a valid response through", () => {
    const r = applyServerGuards({
      replyText: "How about P01?",
      choices: ["Yes", "No"],
      recommendedProgramIds: ["P01"],
    });
    expect(r).toEqual({
      replyText: "How about P01?",
      choices: ["Yes", "No"],
      recommendedProgramIds: ["P01"],
    });
  });

  it("enforces <=3 choices and <=20 chars", () => {
    const r = applyServerGuards({
      replyText: "What is your field?",
      choices: ["Computing", "Medicine", "Business", "Law", "x".repeat(40)],
      recommendedProgramIds: [],
    });
    expect(r.choices).toHaveLength(3);
    r.choices.forEach((c) => expect(c.length).toBeLessThanOrEqual(20));
  });

  it("truncates a long choice", () => {
    const r = applyServerGuards({
      replyText: "Budget?",
      choices: ["I have a very large budget indeed"],
      recommendedProgramIds: [],
    });
    expect(r.choices[0].length).toBeLessThanOrEqual(20);
  });

  it("supplies default choices when none given", () => {
    const r = applyServerGuards({ replyText: "Ok?", choices: [], recommendedProgramIds: [] });
    expect(r.choices.length).toBeGreaterThanOrEqual(1);
  });

  it("returns fallback for hallucinated recommended ID", () => {
    const r = applyServerGuards({
      replyText: "I recommend P42!",
      choices: ["Yes"],
      recommendedProgramIds: ["P42"],
    });
    expect(r.recommendedProgramIds).toEqual([]);
    expect(r.replyText).not.toContain("P42");
    expect(r.replyText).toMatch(/couldn't verify/);
  });

  it("returns fallback for hallucinated programme name", () => {
    const r = applyServerGuards({
      replyText: "Try this",
      choices: ["ok"],
      recommendedProgramIds: ["Underwater Basket Weaving"],
    });
    expect(r.recommendedProgramIds).toEqual([]);
    expect(r.replyText).toMatch(/couldn't verify/);
  });

  it("returns fallback when text mentions unknown ID but list is clean", () => {
    const r = applyServerGuards({
      replyText: "P77 is great",
      choices: ["ok"],
      recommendedProgramIds: [],
    });
    expect(r.replyText).not.toContain("P77");
  });

  it("returns mixed valid+invalid as fallback (strips all)", () => {
    const r = applyServerGuards({
      replyText: "P01 and P50",
      choices: ["ok"],
      recommendedProgramIds: ["P01", "P50"],
    });
    expect(r.recommendedProgramIds).toEqual([]);
  });

  it("normalises names to IDs and dedupes", () => {
    const r = applyServerGuards({
      replyText: "Consider this",
      choices: ["ok"],
      recommendedProgramIds: ["Game Design Intensive", "P13"],
    });
    expect(r.recommendedProgramIds).toEqual(["P13"]);
  });

  it("uses Arabic fallback for Arabic text, with valid choices", () => {
    const r = applyServerGuards({
      replyText: "أنصحك ببرنامج P88",
      choices: ["نعم"],
      recommendedProgramIds: ["P88"],
    });
    expect(isArabic(r.replyText)).toBe(true);
    expect(r.choices.length).toBeLessThanOrEqual(3);
    r.choices.forEach((c) => expect(c.length).toBeLessThanOrEqual(20));
  });

  it("handles empty/garbage input safely", () => {
    for (const input of [null, undefined, {}, { replyText: "" }]) {
      const r = applyServerGuards(input as never);
      expect(r.replyText.length).toBeGreaterThan(0);
      expect(r.choices.length).toBeGreaterThanOrEqual(1);
      expect(r.choices.length).toBeLessThanOrEqual(3);
      expect(r.recommendedProgramIds).toEqual([]);
    }
  });
});

describe("default choices", () => {
  it("uses open-ended English defaults", () => {
    const r = applyServerGuards({ replyText: "What is your budget?", choices: [], recommendedProgramIds: [] });
    expect(r.choices).toEqual(["Flexible", "Not sure yet", "Start over"]);
  });
  it("uses open-ended Arabic defaults within 20 chars", () => {
    const r = applyServerGuards({ replyText: "ما هي ميزانيتك؟", choices: [], recommendedProgramIds: [] });
    expect(r.choices).toEqual(["مرن / مفتوح", "لست متأكداً", "البدء من جديد"]);
    r.choices.forEach((c) => expect(c.length).toBeLessThanOrEqual(20));
  });
});

describe("findUnknownNamesInText / fake names in replyText", () => {
  it("flags a fake university when recommendedProgramIds is empty", () => {
    const r = applyServerGuards({
      replyText: "I recommend Oxford University for you.",
      choices: ["ok"],
      recommendedProgramIds: [],
    });
    expect(r.replyText).toMatch(/couldn't verify/);
    expect(r.replyText).not.toContain("Oxford");
  });
  it("flags a fake programme name", () => {
    expect(findUnknownNamesInText("Try the Quantum Robotics Camp this summer")).toEqual([
      "Quantum Robotics Camp",
    ]);
  });
  it("flags a fake programme even next to a real ID", () => {
    const r = applyServerGuards({
      replyText: "P01 is great, and so is Stanford Summer Institute.",
      choices: ["ok"],
      recommendedProgramIds: ["P01"],
    });
    expect(r.recommendedProgramIds).toEqual([]);
  });
  it("accepts every real programme name and host", () => {
    for (const p of catalog) {
      expect(findUnknownNamesInText(`I suggest ${p.name_en} at ${p.host}.`)).toEqual([]);
    }
  });
  it("does not flag ordinary sentences", () => {
    expect(findUnknownNamesInText("What is your budget? Do you have an IELTS score?")).toEqual([]);
    expect(findUnknownNamesInText("Good choice! The school year is long.")).toEqual([]);
  });
  it("passes a legitimate recommendation through", () => {
    const r = applyServerGuards({
      replyText: "Try Intro to Computer Science at Northbridge Institute (P01).",
      choices: ["More details"],
      recommendedProgramIds: ["P01"],
    });
    expect(r.recommendedProgramIds).toEqual(["P01"]);
    expect(r.replyText).toContain("Northbridge Institute");
  });
});

