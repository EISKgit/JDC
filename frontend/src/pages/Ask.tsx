import { ArrowUpRight, MessageCircleQuestion, RotateCcw, SendHorizontal } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { AskResponse, ChatTurn, UpdateItem } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { PrivacyNote } from "../components/Feedback";
import { dayKey, longDate, relativeDayLabel, timeOfDay } from "../lib/dates";
import { clearAskHistory, loadAskHistory, saveAskHistory } from "../lib/askHistory";
import { usePageTitle } from "../lib/usePageTitle";

const SUGGESTIONS = [
  "How was my week overall?",
  "When did I last go to the gym?",
  "What did I spend money on recently?",
  "What have I been learning lately?",
];

const CITATION = /\[#(\d+)\]/g;

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: UpdateItem[];
  usedAi?: boolean;
  error?: boolean;
}

/** Answer text with [#id] markers turned into numbered references to its source cards. */
function CitedText({ text, sources }: { text: string; sources: UpdateItem[] }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    const index = sources.findIndex((s) => s.id === Number(match[1]));
    parts.push(text.slice(last, match.index));
    if (index >= 0) {
      parts.push(
        <sup key={match.index} className="cite" title={`Source ${index + 1}`}>
          {index + 1}
        </sup>,
      );
    }
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(text.slice(last));
  return <p className="answer-text">{parts}</p>;
}

function SourceCard({ source, number }: { source: UpdateItem; number: number }) {
  const key = dayKey(new Date(source.created_at));
  const categories = [...new Set(source.events.map((e) => e.category))];
  return (
    <li>
      <Link to={`/updates?date=${key}`} className="source-card">
        <span className="source-number">{number}</span>
        <span className="source-body">
          <span className="source-when">
            {relativeDayLabel(key) ?? longDate(key)} · {timeOfDay(source.created_at)}
            {categories.map((c) => (
              <CategoryIcon key={c} category={c} size={13} />
            ))}
          </span>
          <span className="source-text">{source.content}</span>
        </span>
        <ArrowUpRight className="source-open" size={15} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function Ask() {
  usePageTitle("Ask JDC");
  const [messages, setMessages] = useState<Message[]>(() => loadAskHistory<Message>());
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveAskHistory(messages);
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, asking]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    const history: ChatTurn[] = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const reply = await api.post<AskResponse>("/assistant/ask", {
        question: q,
        history,
        tz_offset_minutes: new Date().getTimezoneOffset(),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.answer, sources: reply.sources, usedAi: reply.used_ai },
      ]);
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Couldn't get an answer: ${detail}`, error: true }]);
    } finally {
      setAsking(false);
    }
  }

  function startOver() {
    clearAskHistory();
    setMessages([]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  }

  return (
    <div className="page ask-page">
      <header className="page-header">
        <p className="eyebrow">Ask JDC</p>
        <h1>Ask about your journal</h1>
        <p className="page-subtitle">Answers come only from your own entries, with links to the ones used.</p>
        <PrivacyNote compact />
        {messages.length > 0 && (
          <button type="button" className="btn-secondary btn-small" onClick={startOver} disabled={asking}>
            <RotateCcw size={14} aria-hidden="true" />
            New conversation
          </button>
        )}
      </header>

      {messages.length === 0 && (
        <div className="ask-empty">
          <MessageCircleQuestion className="ask-empty-icon" size={36} aria-hidden="true" />
          <div className="suggestions" role="group" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="suggestion" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="chat" aria-live="polite">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <li key={i} className="bubble bubble-user">
              {m.content}
            </li>
          ) : (
            <li key={i} className={`bubble bubble-assistant ${m.error ? "bubble-error" : ""}`}>
              <CitedText text={m.content} sources={m.sources ?? []} />
              {m.usedAi === false && <span className="search-only">Search only, AI unavailable</span>}
              {m.sources && m.sources.length > 0 && (
                <ol className="sources" aria-label="Sources">
                  {m.sources.map((s, n) => (
                    <SourceCard key={s.id} source={s} number={n + 1} />
                  ))}
                </ol>
              )}
            </li>
          ),
        )}
        {asking && (
          <li className="bubble bubble-assistant bubble-thinking" aria-label="Looking through your journal">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </li>
        )}
      </ol>
      <div ref={endRef} />

      <form className="card ask-form" onSubmit={handleSubmit}>
        <textarea
          rows={1}
          aria-label="Your question"
          placeholder="Ask anything about your days, habits or progress..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="btn-primary ask-send" disabled={asking || !question.trim()} aria-label="Ask">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
