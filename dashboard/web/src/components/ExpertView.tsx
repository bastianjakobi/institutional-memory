import { useMemo, useRef, useState, type DragEvent } from "react";
import { CheckCircle2, FileText, Search, Upload, X } from "lucide-react";
import { api, type Memory } from "../lib/api";
import { relativeDate, titleFromPath } from "../lib/hooks";
import { useSession } from "../lib/session";
import { Markdown } from "./Markdown";
import { MemoryDrawer } from "./MemoryDrawer";
import { SessionActivity } from "./SessionActivity";
import { Button, Card, EmptyState, ErrorNotice, Skeleton, cx } from "./ui";

type Props = {
  name: string;
  memories: Memory[] | undefined;
  memoriesLoading: boolean;
  memoriesError: string | null;
  onRetry: () => void;
  onMemoryChanged: () => void;
};

export function ExpertView({ name, memories, memoriesLoading, memoriesError, onRetry, onMemoryChanged }: Props) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Memory | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { run, start, stop, reset } = useSession();
  const busy = run.status === "running";
  const canSubmit = (note.trim() || files.length > 0) && !busy;

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => /\.(md|txt)$/i.test(f.name));
    setFiles((prev) => [...prev.filter((p) => !picked.some((f) => f.name === p.name)), ...picked]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function ingest() {
    const final = await start((signal) => api.ingest({ name, note, files }, signal));
    if (!final.error) {
      setNote("");
      setFiles([]);
    }
    onMemoryChanged();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (memories ?? []).filter((m) => !q || m.path.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
  }, [memories, query]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Share knowledge, {name}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Anything you add becomes <strong className="font-medium text-zinc-900 dark:text-zinc-100">global team knowledge</strong> for
            every new hire. The agent merges it into existing topics and records what changed.
          </p>
        </div>

        <Card className="space-y-4 p-5">
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium">Note</label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              rows={5}
              placeholder="e.g. Prod access now requires a Jira ticket in ACCESS, approved by the on-call SRE."
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium" id="docs-label">Documents</span>
            <div
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragging ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700",
              )}
            >
              <Upload className="mb-2 size-5 text-zinc-400" aria-hidden />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Drop <code>.md</code> or <code>.txt</code> files here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  aria-describedby="docs-label"
                  className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
                >
                  browse
                </button>
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                multiple
                hidden
                onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))}
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((f) => (
                  <li key={f.name} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 py-1 pr-1 pl-2 text-xs dark:bg-zinc-800">
                    <FileText className="size-3.5 text-zinc-500" aria-hidden />
                    {f.name}
                    <button
                      onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}
                      disabled={busy}
                      aria-label={`Remove ${f.name}`}
                      className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {busy && <Button onClick={stop}>Stop</Button>}
            <Button variant="primary" onClick={ingest} disabled={!canSubmit} loading={busy}>
              {busy ? "Updating team memory…" : "Add to team memory"}
            </Button>
          </div>
        </Card>

        {run.status !== "idle" && (
          <Card className="space-y-3 p-5" aria-live="polite">
            <div className="flex items-center gap-2">
              {run.status === "done" && !run.error ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
                  <h2 className="font-semibold">Team memory updated</h2>
                </>
              ) : (
                <h2 className="font-semibold">{busy ? "Agent is curating…" : "Ingest result"}</h2>
              )}
              {!busy && (
                <button onClick={reset} aria-label="Dismiss" className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <SessionActivity ops={run.ops} running={busy} />
            {run.text && <Markdown>{run.text}</Markdown>}
            {run.error && <ErrorNotice message={run.error} />}
          </Card>
        )}
      </div>

      <section aria-labelledby="team-memory-heading" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="team-memory-heading" className="font-semibold">
            Team memory {memories && <span className="font-normal text-zinc-500">· {memories.length}</span>}
          </h2>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <label htmlFor="memory-search" className="sr-only">Search team memory</label>
            <input
              id="memory-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 w-full rounded-lg border border-zinc-300 bg-white pr-3 pl-8 text-sm shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>

        {memoriesError ? (
          <ErrorNotice message={memoriesError} onRetry={onRetry} />
        ) : memoriesLoading && !memories ? (
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </Card>
        ) : !memories?.length ? (
          <EmptyState icon={<FileText className="size-5" />} title="No team knowledge yet">
            Seed it by uploading the docs in <code>synthetic-data/round1/</code>.
          </EmptyState>
        ) : !filtered.length ? (
          <p className="py-6 text-center text-sm text-zinc-500">No topics match “{query}”.</p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setOpen(m)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:hover:bg-zinc-800/60 dark:focus-visible:bg-zinc-800/60"
                  >
                    <FileText className="size-4 shrink-0 text-zinc-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{titleFromPath(m.path)}</span>
                      <span className="block truncate font-mono text-xs text-zinc-500">{m.path}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">{relativeDate(m.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <MemoryDrawer memory={open} onClose={() => setOpen(null)} />
    </div>
  );
}
