"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw, GraduationCap, MapPin, Calendar, Award } from "lucide-react";
import rawCatalog from "@/data/catalog.json";
import type { Programme } from "@/lib/guards";

const catalog: Programme[] = rawCatalog as Programme[];
const catalogById = new Map(catalog.map((p) => [p.id, p]));

type Msg = {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  recommendedProgramIds?: string[];
};

const INITIAL_MESSAGE: Msg = {
  role: "assistant",
  content:
    "Hi! I'm Simitai. What field are you interested in studying? / مرحباً! ما المجال الذي تهتم بدراسته؟",
  choices: ["Computing", "Medicine", "الهندسة"],
};

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/;
const dirOf = (t: string) => (ARABIC_RE.test(t) ? "rtl" : "ltr");

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function resetChat() {
    setMessages([INITIAL_MESSAGE]);
    setFacts({});
    setInput("");
    setLoading(false);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    // Handle reset quick-replies natively
    if (content.toLowerCase() === "start over" || content === "البدء من جديد") {
      resetChat();
      return;
    }

    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Skip the bilingual UI greeting (index 0) so it doesn't push the model into mixed-language replies.
          messages: next.slice(1).map(({ role, content }) => ({ role, content })),
          studentFacts: facts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      setFacts(data.studentFacts ?? {});
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.replyText,
          choices: data.choices,
          recommendedProgramIds: data.recommendedProgramIds,
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          choices: ["Retry"],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const lastIdx = messages.length - 1;
  const factEntries = Object.entries(facts);

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 md:flex-row">
      {/* Sidebar: Student Profile */}
      <aside className="flex flex-col justify-between border-b border-slate-200 bg-white p-4 md:w-72 md:border-b-0 md:border-r">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <GraduationCap size={18} />
              </div>
              <h1 className="text-base font-bold tracking-tight">Simitai Advisor</h1>
            </div>
            <button
              onClick={resetChat}
              title="Reset conversation"
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>

          <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Student Profile
          </h2>
          {factEntries.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              Share your preferences in the chat to build your profile.
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-wrap gap-2 md:flex-col">
              {factEntries.map(([k, v]) => (
                <li
                  key={k}
                  dir="auto"
                  className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs"
                >
                  <span className="font-semibold capitalize text-blue-900">{k}</span>
                  <span className="font-medium text-blue-700">{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden border-t border-slate-100 pt-3 text-[11px] text-slate-400 md:block">
          Catalog: {catalog.length} verified summer programmes (P01–P14)
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {messages.map((m, i) => {
            const isMsgArabic = dirOf(m.content) === "rtl";
            const recPrograms = (m.recommendedProgramIds ?? [])
              .map((id) => catalogById.get(id))
              .filter((p): p is Programme => Boolean(p));

            return (
              <div
                key={i}
                className={`flex flex-col ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  dir={dirOf(m.content)}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%] ${
                    m.role === "user"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-slate-200/80 bg-white text-slate-800 shadow-sm"
                  }`}
                >
                  {m.content}

                  {/* Rich Programme Cards when recommendations are returned */}
                  {recPrograms.length > 0 && (
                    <div className="mt-3 grid gap-2.5 border-t border-slate-100 pt-3">
                      {recPrograms.map((prog) => (
                        <div
                          key={prog.id}
                          dir={isMsgArabic ? "rtl" : "ltr"}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs transition hover:border-blue-300"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {isMsgArabic ? prog.name_ar : prog.name_en}
                            </span>
                            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-800">
                              {prog.id}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                            <span className="flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" />
                              {prog.host} ({prog.country})
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-slate-400" />
                              {prog.weeks} {isMsgArabic ? "أسابيع" : "wks"}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-2">
                            <span className="font-semibold text-slate-800">
                              {prog.fee === 0
                                ? isMsgArabic
                                  ? "مجاني"
                                  : "Free"
                                : `${prog.fee.toLocaleString()} ${prog.currency}`}
                            </span>
                            {prog.scholarship && (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                <Award size={11} />
                                {isMsgArabic ? "منحة متاحة" : "Scholarship"}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick-Reply Choice Buttons */}
                {i === lastIdx && m.role === "assistant" && m.choices && !loading && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.choices.map((c) => (
                      <button
                        key={c}
                        dir={dirOf(c)}
                        onClick={() => send(c)}
                        className="rounded-full border border-blue-600 bg-white px-3.5 py-1.5 text-xs font-medium text-blue-700 shadow-xs transition hover:bg-blue-600 hover:text-white active:scale-95"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-start">
              <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-xs">
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:0.3s]" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-slate-200 bg-white p-3 md:px-6"
        >
          <input
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message / اكتب رسالة..."
            className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:bg-white"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </form>
      </main>
    </div>
  );
}