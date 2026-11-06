import { useState } from "react";
import { ArrowRight, BookOpen, Lock, UserCog } from "lucide-react";
import { api, type Memory } from "../lib/api";
import { relativeDate, titleFromPath, useAsync, useStoredState } from "../lib/hooks";
import { Chat } from "./Chat";
import { Markdown } from "./Markdown";
import { MemoryDrawer } from "./MemoryDrawer";
import { Badge, Card, EmptyState, ErrorNotice, Skeleton } from "./ui";

type Props = {
  name: string;
  role: string;
  roles: string[];
  onRoleChange: (role: string) => void;
  memories: Memory[] | undefined;
  memoriesLoading: boolean;
  onMemoryChanged: () => void;
};

export function NewHireView({ name, role, roles, onRoleChange, memories, memoriesLoading, onMemoryChanged }: Props) {
  // Re-fetch the briefing whenever the set of memory hashes changes (server caches per role+hashes).
  const memoryKey = memories?.map((m) => m.sha256).join(",") ?? "";
  const brief = useAsync(() => api.briefing(role), [role, memoryKey], !!memories?.length);
  const prefs = useAsync(() => api.preferences(name), [name]);
  const [open, setOpen] = useState<{ memory: Memory; why: string } | null>(null);
  // Content hash of each memory the last time this person opened it -> "Changed" badge when it moves on.
  const [seen, setSeen] = useStoredState<Record<string, string>>(`seen:${name.toLowerCase()}`, {});
  const openCard = (memory: Memory, why: string) => {
    setSeen((s) => ({ ...s, [memory.path]: memory.sha256 }));
    setOpen({ memory, why });
  };

  const byPath = new Map((memories ?? []).map((m) => [m.path, m]));
  const cards = (brief.data?.relevant ?? []).flatMap((r) => {
    const m = byPath.get(r.path);
    return m ? [{ memory: m, why: r.why }] : [];
  });

  if (!memoriesLoading && memories && memories.length === 0)
    return (
      <EmptyState icon={<BookOpen className="size-5" />} title="Team memory is empty">
        Ask an experienced colleague to share the onboarding docs (e.g. <code>synthetic-data/round1/</code>) first.
      </EmptyState>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome aboard, {name} 👋</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Here's what matters most in your first weeks, picked from the team's knowledge for your role.
            </p>
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-xs font-medium text-zinc-500">Your role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 pr-8 text-sm shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {roles.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <section aria-labelledby="briefing-heading" aria-busy={brief.loading}>
          <h2 id="briefing-heading" className="mb-3 text-sm font-medium text-zinc-500">
            Your briefing{cards.length > 0 && ` · ${cards.length} topics`}
          </h2>
          {brief.error && <ErrorNotice message={brief.error} onRetry={brief.reload} />}
          {(brief.loading || memoriesLoading) && !cards.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="space-y-3 p-5">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </Card>
              ))}
              <p className="sr-only">Building your briefing…</p>
            </div>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2">
              {cards.map(({ memory, why }, i) => (
                <li key={memory.path}>
                  <button
                    onClick={() => openCard(memory, why)}
                    className="group flex h-full w-full flex-col rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                        <span className="mr-2 text-zinc-400 tabular-nums">{i + 1}.</span>
                        {titleFromPath(memory.path)}
                      </h3>
                      {seen[memory.path] && seen[memory.path] !== memory.sha256 && <Badge tone="amber">Changed since you read it</Badge>}
                    </div>
                    <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{why}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                      <span>Updated {relativeDate(memory.updated_at)}</span>
                      <span className="flex items-center gap-1 font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-indigo-400">
                        Read & history <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Preferences prefs={prefs.data} loading={prefs.loading} error={prefs.error} onRetry={prefs.reload} />
      </div>

      <Card className="overflow-hidden lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]">
        <Chat
          name={name}
          role={role}
          suggestions={brief.data?.questions}
          suggestionsLoading={brief.loading}
          onMemoryChanged={() => {
            onMemoryChanged();
            prefs.reload();
          }}
        />
      </Card>

      <MemoryDrawer memory={open?.memory ?? null} why={open?.why} onClose={() => setOpen(null)} />
    </div>
  );
}

function Preferences({ prefs, loading, error, onRetry }: { prefs?: Memory[]; loading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <UserCog className="size-4 text-zinc-500" aria-hidden />
        <h2 className="font-semibold">My preferences</h2>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500">
          <Lock className="size-3" aria-hidden /> Only visible to you
        </span>
      </div>
      <div className="mt-3">
        {error ? (
          <ErrorNotice message={error} onRetry={onRetry} />
        ) : loading && !prefs ? (
          <Skeleton className="h-4 w-2/3" />
        ) : !prefs?.length ? (
          <p className="text-sm text-zinc-500">
            None yet. Tell the agent how you like answers (e.g. <em>"answer only in bullet points"</em>) and it'll remember.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {prefs.map((p) => (
              <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                <p className="mb-1 font-mono text-xs text-zinc-500">{p.path}</p>
                <Markdown>{p.content}</Markdown>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
