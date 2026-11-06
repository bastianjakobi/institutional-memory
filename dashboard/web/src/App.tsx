import { useEffect, useState, type FormEvent } from "react";
import { BrainCircuit, ExternalLink, GraduationCap, LogOut, Moon, RefreshCw, Sun, Users } from "lucide-react";
import { api } from "./lib/api";
import { useAsync, useStoredState } from "./lib/hooks";
import { ExpertView } from "./components/ExpertView";
import { NewHireView } from "./components/NewHireView";
import { Button, Card, ErrorNotice, cx } from "./components/ui";

type Mode = "new-hire" | "expert";
type Identity = { name: string; mode: Mode };

export default function App() {
  const [identity, setIdentity] = useStoredState<Identity | null>("identity", null);
  const [role, setRole] = useStoredState<string>("role", "");
  const [dark, setDark] = useDarkMode();
  const config = useAsync(api.config, []);
  const [fresh, setFresh] = useState(0);
  const memories = useAsync(() => api.memories(fresh > 0), [fresh], !!identity);
  const roles = config.data?.roles ?? [];
  const activeRole = roles.includes(role) ? role : roles[0] ?? "";

  const refresh = () => setFresh((n) => n + 1);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-white">
              <BrainCircuit className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Onboarding Memory</span>
          </div>

          {identity && (
            <ModeSwitch mode={identity.mode} onChange={(mode) => setIdentity({ ...identity, mode })} />
          )}

          <div className="ml-auto flex items-center gap-1">
            {identity && (
              <Button variant="ghost" size="sm" onClick={refresh} disabled={memories.loading} title="Reload team memory" aria-label="Refresh team memory">
                <RefreshCw className={cx("size-4", memories.loading && "animate-spin")} aria-hidden />
                <span className="hidden md:inline">Refresh</span>
              </Button>
            )}
            <a
              href="/classic/"
              aria-label="Open the classic UI"
              className="hidden h-8 items-center gap-1.5 rounded-lg px-3 text-sm sm:inline-flex font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="Open the original Streamlit dashboard"
            >
              <span className="hidden md:inline">Classic UI</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </Button>
            {identity && (
              <div className="ml-1 flex items-center gap-2 border-l border-zinc-200 pl-2 sm:ml-2 sm:pl-3 dark:border-zinc-800">
                <Avatar name={identity.name} />
                <span className="hidden text-sm font-medium lg:inline">{identity.name}</span>
                <Button variant="ghost" size="icon" onClick={() => setIdentity(null)} aria-label="Switch person" title="Switch person">
                  <LogOut className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!identity ? (
          <Welcome onStart={setIdentity} />
        ) : config.error ? (
          <ErrorNotice message={config.error} onRetry={config.reload} />
        ) : memories.error && identity.mode === "new-hire" ? (
          <ErrorNotice message={memories.error} onRetry={memories.reload} />
        ) : identity.mode === "new-hire" ? (
          <NewHireView
            key={identity.name}
            name={identity.name}
            role={activeRole}
            roles={roles}
            onRoleChange={setRole}
            memories={memories.data}
            memoriesLoading={memories.loading || config.loading}
            onMemoryChanged={refresh}
          />
        ) : (
          <ExpertView
            key={identity.name}
            name={identity.name}
            memories={memories.data}
            memoriesLoading={memories.loading}
            memoriesError={memories.error}
            onRetry={memories.reload}
            onMemoryChanged={refresh}
          />
        )}
      </main>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: [Mode, string, typeof Users][] = [
    ["new-hire", "New hire", GraduationCap],
    ["expert", "Colleague", Users],
  ];
  return (
    <div role="radiogroup" aria-label="View as" className="ml-2 flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80">
      {options.map(([id, label, Icon]) => (
        <button
          key={id}
          role="radio"
          aria-checked={mode === id}
          onClick={() => onChange(id)}
          className={cx(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-indigo-500",
            mode === id
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className={cx(mode !== id && "sr-only sm:not-sr-only")}>{label}</span>
        </button>
      ))}
    </div>
  );
}

function Welcome({ onStart }: { onStart: (i: Identity) => void }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("new-hire");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onStart({ name: name.trim(), mode });
  };
  const choices: [Mode, string, string, typeof Users][] = [
    ["new-hire", "I'm a new hire", "Get a briefing for your role and ask questions.", GraduationCap],
    ["expert", "I'm an experienced colleague", "Share docs and notes as team knowledge.", Users],
  ];

  return (
    <div className="mx-auto max-w-lg pt-6 sm:pt-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Your team's memory, on day one</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Experienced colleagues share what they know; new hires get the current truth — and see how it changed.
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How are you joining?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map(([id, title, desc, Icon]) => (
                <label
                  key={id}
                  className={cx(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3.5 transition has-focus-visible:outline-2 has-focus-visible:outline-indigo-500",
                    mode === id
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:bg-indigo-500/10"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600",
                  )}
                >
                  <input type="radio" name="mode" value={id} checked={mode === id} onChange={() => setMode(id)} className="sr-only" />
                  <Icon className={cx("size-5", mode === id ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400")} aria-hidden />
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-xs text-zinc-500">{desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Your name</label>
            <input
              id="name"
              autoFocus
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-1.5 text-xs text-zinc-500">No login — your name keeps your personal preferences separate from others'.</p>
          </div>
          <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const hue = [...name.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue} 55% 50%)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function useDarkMode() {
  const [dark, setDark] = useStoredState<boolean>("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return [dark, setDark] as const;
}
