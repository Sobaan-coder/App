"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deletePaper, updatePaper } from "@/lib/actions/past-papers";
import { toast } from "sonner";

export function PaperDetailsActions({ paper }: { paper: { id: string; title: string; year: number | null; session: string | null } }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [title, setTitle] = useState(paper.title);
  const [year, setYear] = useState(paper.year?.toString() ?? "");
  const [session, setSession] = useState(paper.session ?? "");
  const [pending, start] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Paper options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 /> Delete paper
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "edit" ? "Paper details" : "Delete this paper?"}</DialogTitle>
            {dialog === "delete" && <DialogDescription>Its questions and mappings are removed from your analytics and question bank.</DialogDescription>}
          </DialogHeader>
          {dialog === "edit" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pp-title">Title</Label>
                <Input id="pp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pp-y">Year</Label>
                  <Input id="pp-y" type="number" min={1950} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pp-s">Session</Label>
                  <Input id="pp-s" value={session} onChange={(e) => setSession(e.target.value)} placeholder="Spring / Autumn" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res =
                    dialog === "delete"
                      ? await deletePaper(paper.id)
                      : await updatePaper(paper.id, { title, year: year ? Number(year) : null, session: session || null });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(dialog === "delete" ? "Paper deleted" : "Saved");
                  if (dialog === "delete") router.push("/past-papers");
                  else router.refresh();
                  setDialog(null);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} {dialog === "delete" ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
