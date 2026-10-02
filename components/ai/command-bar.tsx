"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, CalendarRange, FileQuestion, FileText, Flame, Layers, ListChecks, Loader2, MessageSquare, Repeat, Sparkles, SquareCheck, Timer, Library,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";

type Result = { kind: string; id: string; title: string; snippet: string | null; href: string };

const KIND_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  subject: { label: "Subjects", icon: Library },
  topic: { label: "Topics", icon: BookOpen },
  resource: { label: "Resources", icon: FileText },
  chunk: { label: "Inside your notes", icon: FileText },
  past_paper_question: { label: "Past-paper questions", icon: FileQuestion },
  question: { label: "Question bank", icon: ListChecks },
  task: { label: "Tasks", icon: SquareCheck },
  flashcard: { label: "Flashcards", icon: Layers },
  study_session: { label: "Study sessions", icon: Timer },
  conversation: { label: "AI conversations", icon: MessageSquare },
};

const SUGGESTIONS = [
  { text: "I have 3 days before my exam. What should I study?", icon: CalendarRange },
  { text: "Give me today's revision", icon: Repeat },
  { text: "Show my weakest topics", icon: Flame },
  { text: "Which topics have appeared most often in my past papers?", icon: FileQuestion },
  { text: "Create a 2-hour study plan", icon: Timer },
];

export function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced workspace search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.current.signal });
        const json = await res.json();
        setResults(json.results ?? []);
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function ask(text: string) {
    if (!text.trim()) return;
    setRouting(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onOpenChange(false);
      router.push(json.href);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't process that. Try rephrasing.");
    } finally {
      setRouting(false);
    }
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="What do you need to study?"
            aria-label="Ask Study OS or search your workspace"
            onKeyDown={(e) => {
              // Enter with no highlighted search result → ask Study OS.
              if (e.key === "Enter" && results.length === 0 && query.trim()) {
                e.preventDefault();
                ask(query);
              }
            }}
          />
          <CommandList>
            {query.trim() ? (
              <CommandGroup heading="Ask Study OS">
                <CommandItem value={`ask:${query}`} onSelect={() => ask(query)} disabled={routing}>
                  {routing ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />}
                  <span className="truncate">{query}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Enter</span>
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandGroup heading="Try asking">
                {SUGGESTIONS.map((s) => (
                  <CommandItem key={s.text} value={s.text} onSelect={() => ask(s.text)}>
                    <s.icon />
                    {s.text}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {Object.entries(grouped).map(([kind, items]) => {
              const meta = KIND_META[kind] ?? { label: kind, icon: BookOpen };
              return (
                <CommandGroup key={kind} heading={meta.label}>
                  {items.map((r) => (
                    <CommandItem key={`${kind}-${r.id}`} value={`${kind}-${r.id}`} onSelect={() => go(r.href)}>
                      <meta.icon />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.title}</span>
                        {r.snippet && (
                          <span className="block truncate text-xs text-muted-foreground">{r.snippet.replace(/<\/?b>/g, "")}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <CommandEmpty>No matches in your workspace — press Enter to ask Study OS.</CommandEmpty>
            )}
            {searching && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Searching your workspace…
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
