import { useState } from "react";
import { BrainCircuit, ChevronDown } from "lucide-react";
import type { MemoryOp } from "../lib/session";
import { cx } from "./ui";

/** Collapsible list of memory reads/writes the agent made during a session. */
export function SessionActivity({ ops, running }: { ops: MemoryOp[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  if (!ops.length && !running) return null;
  const last = ops.at(-1);
  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!ops.length}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-zinc-100 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
      >
        <BrainCircuit className={cx("size-3.5 shrink-0", running && "animate-pulse text-indigo-500")} aria-hidden />
        <span className="truncate">
          {running && last ? `${last.tool} · ${shortPath(last.path)}` : running ? "Reading memory…" : `${ops.length} memory operation${ops.length === 1 ? "" : "s"}`}
        </span>
        {ops.length > 0 && <ChevronDown className={cx("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-zinc-200 pl-3 font-mono dark:border-zinc-700">
          {ops.map((op, i) => (
            <li key={i} className="truncate">
              <span className="text-zinc-400">{op.tool}</span> {shortPath(op.path)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function shortPath(p: string) {
  return p.replace(/.*\/mnt\/memory\//, "");
}
