"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookCheck, FileQuestion, FileText, Globe2, Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";

import { MODES, type Mode } from "@/lib/ai/tutor-modes";
export type { Mode };

export type Citation = { n: number; kind: "chunk" | "past_paper_question"; title: string; page: number | null; resourceId: string | null; paperId: string | null; id: string };
export type Msg = { id?: string; role: "user" | "assistant"; content: string; citations?: Citation[]; grounded?: boolean | null; pending?: boolean; error?: string };

function sourceHref(c: Citation) {
  return c.kind === "chunk" ? `/resources/${c.resourceId}` : `/past-papers/${c.paperId}#q-${c.id}`;
}

function SourceList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      <ul className="flex flex-wrap gap-1.5">
        {citations.map((c) => (
          <li key={c.n}>
            <a href={sourceHref(c)} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs hover:bg-accent">
              <span className="font-semibold text-primary">{c.n}</span>
              {c.kind === "chunk" ? <FileText className="size-3" /> : <FileQuestion className="size-3" />}
              <span className="max-w-56 truncate">{c.title}</span>
              {c.page && <span className="text-muted-foreground">— Page {c.page}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TutorChat({
  conversationId: initialConversationId,
  initialMessages,
  context,
  initialQuery,
  initialMode = "explain_simply",
  contextLabel,
}: {
  conversationId?: string;
  initialMessages: Msg[];
  context: { subject_id?: string | null; topic_id?: string | null; resource_id?: string | null };
  initialQuery?: string;
  initialMode?: Mode;
  contextLabel?: string | null;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (initialQuery && !sentInitial.current && initialMessages.length === 0) {
      sentInitial.current = true;
      send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "", pending: true }]);
    const update = (patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
        return copy;
      });

    abortRef.current = new AbortController();
    let sources: Citation[] = [];
    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId ?? null, message, mode, ...context }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "The tutor couldn't answer. Try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "meta") {
            sources = evt.sources;
            if (!conversationId) {
              setConversationId(evt.conversation_id);
              window.history.replaceState(null, "", `/tutor/${evt.conversation_id}`);
            }
          } else if (evt.type === "delta") {
            update((m) => ({ content: m.content + evt.text }));
          } else if (evt.type === "done") {
            update({ pending: false, id: evt.message_id, citations: evt.citations, grounded: evt.grounded });
          } else if (evt.type === "error") {
            update({ pending: false, error: evt.error });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") update({ pending: false });
      else update({ pending: false, error: (e as Error).message });
    } finally {
      setStreaming(false);
      void sources;
      router.refresh();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col md:h-[calc(100dvh-7rem)]">
      <div className="flex-1 space-y-5 overflow-y-auto pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl py-10 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">What are you working on?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              I answer from your notes, PDFs, syllabus and past papers first — with citations — and tell you when something isn&apos;t in your materials.
              {contextLabel && (
                <>
                  <br />
                  Focused on <span className="font-medium text-foreground">{contextLabel}</span>.
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["Explain OAR calculation like I'm a child", "Explain IAS 38 development costs", "Was revaluation asked in 2024?", "Summarize my notes on impairment"].map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card px-4 py-3">
                {m.grounded !== undefined && m.grounded !== null && !m.pending && (
                  <Badge variant={m.grounded ? "success" : "muted"} className="mb-2">
                    {m.grounded ? <BookCheck /> : <Globe2 />}
                    {m.grounded ? "Grounded in your materials" : "General knowledge — not found in your materials"}
                  </Badge>
                )}
                {m.content ? (
                  <Markdown text={m.content} sources={(m.citations ?? []).map((c) => ({ n: c.n, href: sourceHref(c), title: c.title, page: c.page }))} />
                ) : m.pending ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Searching your materials…
                  </p>
                ) : null}
                {m.error && <p className="mt-2 text-sm text-destructive">{m.error}</p>}
                <SourceList citations={m.citations ?? []} />
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t bg-background pt-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none" role="radiogroup" aria-label="Tutor mode">
          {MODES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              onClick={() => setMode(key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                mode === key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-[3px] focus-within:ring-ring/30"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={mode === "find_mistake" ? "Paste your working and the question…" : "Ask anything about your subjects…"}
            aria-label="Message the AI tutor"
            className="max-h-48 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          {streaming ? (
            <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          )}
        </form>
        <p className="text-center text-[11px] text-muted-foreground">AI can make mistakes. Check important facts against your syllabus and standards.</p>
      </div>
    </div>
  );
}
