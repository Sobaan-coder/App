"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BookOpen, CalendarCheck2, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, Loader2, NotebookPen, Plus, Repeat, Timer, Trash2, Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteEvent, moveCalendarItem, saveEvent, setEventCompleted } from "@/lib/actions/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type CalItem = {
  key: string;
  kind: "event" | "task" | "session" | "exam" | "revision";
  id: string;
  type: "exam" | "assignment" | "quiz" | "class" | "study_session" | "deadline" | "revision";
  title: string;
  date: string; // YYYY-MM-DD (local)
  time: string | null; // HH:MM
  endTime?: string | null;
  completed: boolean;
  href?: string;
  subjectId?: string | null;
  description?: string | null;
  allDay?: boolean;
};

export const TYPE_META: Record<CalItem["type"], { label: string; icon: LucideIcon; className: string }> = {
  exam: { label: "Exam", icon: GraduationCap, className: "bg-destructive/12 text-destructive border-destructive/30" },
  assignment: { label: "Assignment", icon: NotebookPen, className: "bg-chart-3/15 text-foreground border-chart-3/40" },
  quiz: { label: "Quiz", icon: ClipboardList, className: "bg-chart-4/12 text-foreground border-chart-4/35" },
  class: { label: "Class", icon: Users, className: "bg-chart-2/12 text-foreground border-chart-2/35" },
  study_session: { label: "Study session", icon: Timer, className: "bg-primary/10 text-foreground border-primary/30" },
  deadline: { label: "Deadline", icon: CalendarCheck2, className: "bg-muted text-foreground border-border" },
  revision: { label: "Revision", icon: Repeat, className: "bg-chart-5/12 text-foreground border-chart-5/35" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Draft = { id?: string; title: string; type: CalItem["type"]; date: string; time: string; endTime: string; allDay: boolean; subjectId: string; description: string };

export function CalendarView({ month, items, subjects, today }: { month: string; items: CalItem[]; subjects: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [dragKey, setDragKey] = useState<string | null>(null);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(y, m - 1, 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [items]);
  const prev = new Date(y, m - 2, 1);
  const next = new Date(y, m, 1);
  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const openNew = (date: string) => setDraft({ title: "", type: "class", date, time: "09:00", endTime: "10:00", allDay: false, subjectId: "", description: "" });
  const openEdit = (it: CalItem) =>
    it.kind === "event"
      ? setDraft({ id: it.id, title: it.title, type: it.type, date: it.date, time: it.time ?? "09:00", endTime: it.endTime ?? "", allDay: !!it.allDay, subjectId: it.subjectId ?? "", description: it.description ?? "" })
      : it.href && router.push(it.href);

  function onDrop(date: string) {
    const it = items.find((x) => x.key === dragKey);
    setDragKey(null);
    if (!it || it.date === date || !(it.kind === "event" || it.kind === "task" || it.kind === "session")) return;
    start(async () => {
      const res = await moveCalendarItem(it.kind as "event" | "task" | "session", it.id, date);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Moved to ${date}`);
      router.refresh();
    });
  }

  function save() {
    if (!draft) return;
    const startAt = new Date(`${draft.date}T${draft.allDay ? "00:00" : draft.time}`).toISOString();
    const endAt = !draft.allDay && draft.endTime ? new Date(`${draft.date}T${draft.endTime}`).toISOString() : null;
    start(async () => {
      const res = await saveEvent({ id: draft.id, title: draft.title, type: draft.type, start_at: startAt, end_at: endAt, all_day: draft.allDay, subject_id: draft.subjectId || null, description: draft.description || null });
      if (!res.ok) return void toast.error(res.error);
      setDraft(null);
      router.refresh();
    });
  }

  const ItemChip = ({ it, compact }: { it: CalItem; compact?: boolean }) => {
    const meta = TYPE_META[it.type];
    const draggable = it.kind === "event" || it.kind === "task" || it.kind === "session";
    return (
      <button
        type="button"
        draggable={draggable}
        onDragStart={() => setDragKey(it.key)}
        onClick={(e) => {
          e.stopPropagation();
          openEdit(it);
        }}
        className={cn("flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight", meta.className, it.completed && "line-through opacity-60", draggable && "cursor-grab")}
        title={`${meta.label}: ${it.title}${it.time ? ` · ${it.time}` : ""}`}
      >
        <meta.icon className="size-3 shrink-0" aria-hidden="true" />
        {!compact && it.time && <span className="shrink-0 tabular-nums opacity-70">{it.time}</span>}
        <span className="truncate">{it.title}</span>
        <span className="sr-only">({meta.label})</span>
      </button>
    );
  };

  const agendaDays = cells.filter((d) => d.getMonth() === m - 1 && byDay.has(iso(d)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon-sm" aria-label="Previous month">
            <Link href={`/calendar?month=${iso(prev).slice(0, 7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel}</h2>
          <Button asChild variant="outline" size="icon-sm" aria-label="Next month">
            <Link href={`/calendar?month=${iso(next).slice(0, 7)}`}>
              <ChevronRight />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/calendar">Today</Link>
          </Button>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <Button onClick={() => openNew(today)}>
          <Plus /> New event
        </Button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
        {Object.entries(TYPE_META).map(([k, v]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn("flex size-5 items-center justify-center rounded border", v.className)}>
              <v.icon className="size-3" />
            </span>
            {v.label}
          </li>
        ))}
      </ul>

      {/* Month grid (tablet/desktop) */}
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = iso(d);
            const list = byDay.get(key) ?? [];
            const outside = d.getMonth() !== m - 1;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`${d.toDateString()}, ${list.length} items. Press Enter to add an event.`}
                onClick={() => openNew(key)}
                onKeyDown={(e) => e.key === "Enter" && openNew(key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(key)}
                className={cn("group min-h-28 border-r border-b p-1.5 text-left transition-colors last:border-r-0 hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none [&:nth-child(7n)]:border-r-0", outside && "bg-muted/20 text-muted-foreground")}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular-nums", key === today && "bg-primary font-semibold text-primary-foreground")}>{d.getDate()}</span>
                  <Plus className="size-3.5 opacity-0 transition-opacity group-hover:opacity-50" aria-hidden="true" />
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, 4).map((it) => (
                    <ItemChip key={it.key} it={it} />
                  ))}
                  {list.length > 4 && <p className="px-1 text-[11px] text-muted-foreground">+{list.length - 4} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (mobile) */}
      <div className="space-y-4 md:hidden">
        {agendaDays.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled this month.</p>}
        {agendaDays.map((d) => {
          const key = iso(d);
          return (
            <section key={key}>
              <h3 className={cn("mb-2 text-sm font-semibold", key === today && "text-primary")}>{d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</h3>
              <ul className="space-y-1.5">
                {byDay.get(key)!.map((it) => {
                  const meta = TYPE_META[it.type];
                  return (
                    <li key={it.key}>
                      <button type="button" onClick={() => openEdit(it)} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm", meta.className, it.completed && "opacity-60")}>
                        <meta.icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{it.title}</span>
                        <span className="shrink-0 text-xs opacity-70">{it.time ?? meta.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ev-title">Title</Label>
                <Input id="ev-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required maxLength={300} placeholder="FAR academy class" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-type">Type</Label>
                  <select id="ev-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CalItem["type"] })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-subject">Subject</Label>
                  <select id="ev-subject" value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                    <option value="">None</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-date">Date</Label>
                  <Input id="ev-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-start">Start</Label>
                  <Input id="ev-start" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} disabled={draft.allDay} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-end">End</Label>
                  <Input id="ev-end" type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} disabled={draft.allDay} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.allDay} onCheckedChange={(v) => setDraft({ ...draft, allDay: v })} /> All day
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="ev-desc">Notes</Label>
                <Textarea id="ev-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-16" />
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                {draft.id ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        start(async () => {
                          const res = await deleteEvent(draft.id!);
                          if (!res.ok) return void toast.error(res.error);
                          setDraft(null);
                          router.refresh();
                        })
                      }
                    >
                      <Trash2 /> Delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        start(async () => {
                          const it = items.find((x) => x.kind === "event" && x.id === draft.id);
                          const res = await setEventCompleted(draft.id!, !it?.completed);
                          if (!res.ok) return void toast.error(res.error);
                          setDraft(null);
                          router.refresh();
                        })
                      }
                    >
                      <BookOpen /> {items.find((x) => x.kind === "event" && x.id === draft.id)?.completed ? "Mark not done" : "Mark complete"}
                    </Button>
                  </div>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
