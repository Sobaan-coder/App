"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteSubject, updateSubject } from "@/lib/actions/subjects";
import { toast } from "sonner";

export function SubjectHeaderActions({ subject }: { subject: { id: string; name: string; code: string | null; exam_date: string | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.code ?? "");
  const [exam, setExam] = useState(subject.exam_date ?? "");
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen("edit")}>
        <CalendarDays /> {subject.exam_date ? "Change exam date" : "Set exam date"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Subject options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("edit")}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen("delete")}>
            <Trash2 /> Delete subject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={(o) => setOpen(o ? "edit" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subject details</DialogTitle>
            <DialogDescription>Your exam date drives countdowns, plans and revision timing.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await updateSubject(subject.id, { name, code: code || null, exam_date: exam || null });
                if (!res.ok) return void toast.error(res.error);
                toast.success("Saved");
                setOpen(null);
                router.refresh();
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="sub-name">Name</Label>
              <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-code">Code</Label>
                <Input id="sub-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-exam">Exam date</Label>
                <Input id="sub-exam" type="date" value={exam} onChange={(e) => setExam(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "delete"} onOpenChange={(o) => setOpen(o ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {subject.name}?</DialogTitle>
            <DialogDescription>This removes its chapters, topics, progress and past papers. Uploaded resources are kept but unlinked. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteSubject(subject.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Subject deleted");
                  router.push("/subjects");
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
