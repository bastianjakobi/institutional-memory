import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, MessageSquareText, Sparkles, Square, Trash2 } from "lucide-react";
import { api, type ChatTurn } from "../lib/api";
import { useStoredState } from "../lib/hooks";
import { useSession } from "../lib/session";
import { Markdown } from "./Markdown";
import { SessionActivity } from "./SessionActivity";
import { Button, ErrorNotice, Skeleton } from "./ui";

type Props = {
  name: string;
  role: string;
  suggestions: string[] | undefined;
  suggestionsLoading: boolean;
  onMemoryChanged: () => void;
};

export function Chat({ name, role, suggestions, suggestionsLoading, onMemoryChanged }: Props) {
  const [history, setHistory] = useStoredState<ChatTurn[]>(`chat:${name.toLowerCase()}`, []);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const { run, start, stop, reset } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = run.status === "running";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length, run.text, pending]);

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    setDraft("");
    setPending(question);
    const prior = history;
    const final = await start((signal) => api.chat({ name, role, question, history: prior }, signal));
    setPending(null);
    const turns: ChatTurn[] = [{ role: "user", content: question }];
    if (final.text.trim()) turns.push({ role: "assistant", content: final.text.trim() });
    setHistory([...prior, ...turns]);
    if (!final.error) reset();
    onMemoryChanged();
    inputRef.current?.focus();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  }

  const empty = history.length === 0 && !pending;

  return (
    <section aria-label="Ask the onboarding agent" className="flex h-full min-h-[32rem] flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-indigo-500" aria-hidden />
          <h2 className="font-semibold">Ask the onboarding agent</h2>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setHistory([])} disabled={busy} title="Clear conversation">
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Clear</span>
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5" aria-live="polite">
        {empty && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Answers come from your team's shared knowledge. You can also tell the agent how you like answers —
              e.g. <em>"bullet points only"</em> — and it will remember that just for you.
            </p>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Sparkles className="size-3.5" aria-hidden /> Suggested for a {role}
              </p>
              {suggestionsLoading && !suggestions ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <ul className="space-y-2">
                  {(suggestions ?? []).map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => ask(q)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-left text-sm text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {history.map((t, i) => <Bubble key={i} turn={t} />)}

        {pending && (
          <>
            <Bubble turn={{ role: "user", content: pending }} />
            <div className="space-y-2">
              <SessionActivity ops={run.ops} running={busy} />
              {run.text ? (
                <Markdown>{run.text}</Markdown>
              ) : (
                <div className="flex gap-1 py-2" aria-label="Agent is thinking">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {run.error && <ErrorNotice message={run.error} />}
      </div>

      {!empty && suggestions && suggestions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={busy}
              className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-indigo-300"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-300 bg-white p-1.5 shadow-xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything, or tell me how you like answers…"
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-zinc-400"
          />
          {busy ? (
            <Button type="button" size="icon" onClick={stop} aria-label="Stop generating" className="size-9">
              <Square className="size-3.5 fill-current" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" variant="primary" size="icon" disabled={!draft.trim()} aria-label="Send" className="size-9">
              <ArrowUp className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-zinc-500">Enter to send · Shift+Enter for a new line</p>
      </form>
    </section>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
          {turn.content}
        </div>
      </div>
    );
  return <Markdown>{turn.content}</Markdown>;
}
