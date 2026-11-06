import { useEffect, useRef, useState } from "react";
import { FileText, History, X } from "lucide-react";
import { api, type Memory, type TimelineEntry } from "../lib/api";
import { relativeDate, titleFromPath, useAsync } from "../lib/hooks";
import { Markdown } from "./Markdown";
import { Badge, ErrorNotice, Skeleton, cx } from "./ui";

/** Slide-over with a memory's current content and its version history. */
export function MemoryDrawer({ memory, why, onClose }: { memory: Memory | null; why?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"current" | "history">("current");

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (memory && !dlg.open) {
      setTab("current");
      dlg.showModal();
    } else if (!memory && dlg.open) dlg.close();
  }, [memory]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="memory-drawer-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl bg-transparent p-0 backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]"
    >
      {memory && (
        <div className="flex h-full flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex items-start gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <div className="min-w-0 flex-1">
              <h2 id="memory-drawer-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {titleFromPath(memory.path)}
              </h2>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{memory.path}</p>
              {why && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{why}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X className="size-5" />
            </button>
          </header>

          <div role="tablist" aria-label="Memory views" className="flex gap-1 border-b border-zinc-200 px-4 dark:border-zinc-800">
            {(
              [
                ["current", "Current", FileText],
                ["history", "History", History],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500",
                  tab === id
                    ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-zinc-500">Updated {relativeDate(memory.updated_at)}</span>
          </div>

          <div role="tabpanel" className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "current" ? <Markdown>{memory.content}</Markdown> : <Timeline memory={memory} />}
          </div>
        </div>
      )}
    </dialog>
  );
}

const OP_STYLE: Record<string, { tone: "green" | "amber" | "red" | "zinc"; dot: string }> = {
  created: { tone: "green", dot: "bg-emerald-500" },
  modified: { tone: "amber", dot: "bg-amber-500" },
  deleted: { tone: "red", dot: "bg-rose-500" },
};

function Timeline({ memory }: { memory: Memory }) {
  const { data, error, loading, reload } = useAsync(() => api.timeline(memory), [memory.id, memory.sha256]);

  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading && !data)
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  const entries = [...(data ?? [])].reverse(); // newest first

  return (
    <div>
      <ol className="relative space-y-6 border-l border-zinc-200 pl-6 dark:border-zinc-800">
        {entries.map((e, i) => (
          <TimelineItem key={i} entry={e} latest={i === 0} />
        ))}
      </ol>
      {entries.length === 1 && <p className="mt-6 text-sm text-zinc-500">No changes since this was first learned.</p>}
    </div>
  );
}

function TimelineItem({ entry, latest }: { entry: TimelineEntry; latest: boolean }) {
  const style = OP_STYLE[entry.operation] ?? { tone: "zinc" as const, dot: "bg-zinc-400" };
  return (
    <li className="relative">
      <span className={cx("absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-white dark:ring-zinc-900", style.dot)} aria-hidden />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={style.tone}>{entry.operation}</Badge>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.author}</span>
        <time className="text-zinc-500">{entry.when}</time>
        {latest && <Badge tone="indigo">current</Badge>}
      </div>
      {entry.diff && <Diff diff={entry.diff} />}
    </li>
  );
}

function Diff({ diff }: { diff: string }) {
  const lines = diff.split("\n").filter((l) => !l.startsWith("---") && !l.startsWith("+++"));
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 py-2 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-950">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            "px-3 whitespace-pre-wrap",
            l.startsWith("+") && "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
            l.startsWith("-") && "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300",
            l.startsWith("@@") && "text-indigo-600 dark:text-indigo-400",
          )}
        >
          <span className="sr-only">{l.startsWith("+") ? "Added: " : l.startsWith("-") ? "Removed: " : ""}</span>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
