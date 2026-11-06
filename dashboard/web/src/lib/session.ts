import { useCallback, useRef, useState } from "react";
import type { SessionEvent } from "./api";

export type MemoryOp = { tool: string; path: string };

export type SessionRun = {
  text: string;
  ops: MemoryOp[];
  error: string | null;
  status: "idle" | "running" | "done" | "error";
};

const IDLE: SessionRun = { text: "", ops: [], error: null, status: "idle" };

/** Drive one streamed Managed Agent session and expose its progress as React state. */
export function useSession() {
  const [run, setRun] = useState<SessionRun>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (open: (signal: AbortSignal) => AsyncGenerator<SessionEvent>): Promise<SessionRun> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let state: SessionRun = { ...IDLE, status: "running" };
      setRun(state);
      const update = (patch: Partial<SessionRun>) => setRun((state = { ...state, ...patch }));
      try {
        for await (const e of open(ctrl.signal)) {
          if (e.type === "text") update({ text: state.text + e.text });
          else if (e.type === "memory_op") update({ ops: [...state.ops, { tool: e.tool, path: e.path }] });
          else if (e.type === "error") update({ error: `The session ended unexpectedly (${e.event}).` });
        }
        update({ status: state.error ? "error" : "done" });
      } catch (err) {
        if (ctrl.signal.aborted) update({ status: "done", error: state.error });
        else update({ status: "error", error: (err as Error).message });
      }
      return state;
    },
    [],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => setRun(IDLE), []);
  return { run, start, stop, reset };
}
