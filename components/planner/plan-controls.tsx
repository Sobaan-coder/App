"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, CalendarClock, Check, Loader2, MoreHorizontal, Play, RefreshCw, SkipForward, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { adaptPlan, archivePlan, deletePlan, moveSession } from "@/lib/actions/planner";
import { setPlanSessionStatus } from "@/lib/actions/plan-sessions";
import { toast } from "sonner";

export function PlanActions({ planId, subjectId, archived }: { planId: string; subjectId: string | null; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {!archived && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await adaptPlan(planId);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message ?? "Plan updated");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Adapt to my progress
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href={`/planner/new?replace=${planId}${subjectId ? `&subject=${subjectId}` : ""}&prompt=${encodeURIComponent("Replan my remaining days based on what I've completed, skipped and my current confidence.")}`}>
          <Sparkles /> Regenerate
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Plan options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!archived && (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await archivePlan(planId);
                  if (!res.ok) return void toast.error(res.error);
                  router.refresh();
                })
              }
            >
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              confirm("Delete this plan?") &&
              start(async () => {
                const res = await deletePlan(planId);
                if (!res.ok) return void toast.error(res.error);
                router.push("/planner");
              })
            }
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SessionActions({ id, status, date, startTime }: { id: string; status: "planned" | "in_progress" | "done" | "skipped"; date: string; startTime: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState(false);
  const [newDate, setNewDate] = useState(date);
  const [newTime, setNewTime] = useState(startTime?.slice(0, 5) ?? "");

  const set = (s: "planned" | "done" | "skipped") =>
    start(async () => {
      const res = await setPlanSessionStatus(id, s);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });

  return (
    <div className="flex shrink-0 items-center gap-1">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {status === "planned" || status === "in_progress" ? (
        <>
          <Button asChild size="sm">
            <Link href={`/study/session/new?plan_session=${id}`}>
              <Play /> Start
            </Link>
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Mark done" onClick={() => set("done")}>
            <Check />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Skip" onClick={() => set("skipped")}>
            <SkipForward />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Move to another day" onClick={() => setMoving(true)}>
            <CalendarClock />
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => set("planned")}>
          <Undo2 /> Undo
        </Button>
      )}
      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move session</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" aria-label="New date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <Input type="time" aria-label="New start time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                start(async () => {
                  const res = await moveSession(id, newDate, newTime || null);
                  if (!res.ok) return void toast.error(res.error);
                  setMoving(false);
                  router.refresh();
                })
              }
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
