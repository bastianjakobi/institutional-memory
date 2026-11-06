// Typed client for dashboard/server.py.

export type Memory = {
  id: string;
  path: string;
  content: string;
  sha256: string;
  updated_at: string;
};

export type TimelineEntry = {
  when: string;
  operation: "created" | "modified" | "deleted" | string;
  author: string;
  content: string;
  diff: string | null;
};

export type Briefing = {
  relevant: { path: string; why: string }[];
  questions: string[];
};

export type SessionEvent =
  | { type: "text"; text: string }
  | { type: "memory_op"; tool: string; path: string }
  | { type: "error"; event: string }
  | { type: "done" };

export type ChatTurn = { role: "user" | "assistant"; content: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<T>;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    /* not JSON */
  }
  return `${res.status} ${res.statusText}`;
}

export const api = {
  config: () => request<{ roles: string[] }>("/api/config"),
  memories: (fresh = false) => request<Memory[]>(`/api/memories${fresh ? "?fresh=true" : ""}`),
  timeline: (m: Memory) =>
    request<TimelineEntry[]>(`/api/memories/${encodeURIComponent(m.id)}/timeline?sha=${m.sha256}`),
  briefing: (role: string) => request<Briefing>(`/api/briefing?role=${encodeURIComponent(role)}`),
  preferences: (name: string) => request<Memory[]>(`/api/users/${encodeURIComponent(name)}/preferences`),

  chat: (body: { name: string; role: string; question: string; history: ChatTurn[] }, signal?: AbortSignal) =>
    stream("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }),

  ingest: (body: { name: string; note: string; files: File[] }, signal?: AbortSignal) => {
    const form = new FormData();
    form.set("name", body.name);
    form.set("note", body.note);
    body.files.forEach((f) => form.append("files", f));
    return stream("/api/ingest", { method: "POST", body: form, signal });
  },
};

/** POST and yield NDJSON session events as they arrive. */
async function* stream(url: string, init: RequestInit): AsyncGenerator<SessionEvent> {
  const res = await fetch(url, init);
  if (!res.ok || !res.body) throw new Error(await errorMessage(res));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as SessionEvent;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as SessionEvent;
}
