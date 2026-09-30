"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderInput, Loader2, MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteResource, updateResource } from "@/lib/actions/resources";
import { formatDate } from "@/lib/format";
import { RESOURCE_TYPE_META, STATUS_META, type ResourceType } from "./resource-icons";
import { toast } from "sonner";

export type ResourceCardData = {
  id: string;
  title: string;
  type: ResourceType;
  processing_status: keyof typeof STATUS_META;
  processing_error: string | null;
  created_at: string;
  summary: string | null;
  tags: string[];
  subject_id: string | null;
  subjectName: string | null;
  suggestedSubjectName: string | null;
};

export function ResourceCard({ r, subjects }: { r: ResourceCardData; subjects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "move" | "tags" | "delete" | null>(null);
  const [title, setTitle] = useState(r.title);
  const [subject, setSubject] = useState(r.subject_id ?? "");
  const [tags, setTags] = useState(r.tags.join(", "));
  const [pending, start] = useTransition();
  const meta = RESOURCE_TYPE_META[r.type];
  const status = STATUS_META[r.processing_status];

  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error((res as { error: string }).error);
      toast.success(msg);
      setDialog(null);
      router.refresh();
    });

  return (
    <li className="group relative flex flex-col rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <meta.icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/resources/${r.id}`} className="line-clamp-2 font-medium leading-snug after:absolute after:inset-0 hover:text-primary">
            {r.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {meta.label} · {formatDate(r.created_at)}
            {r.subjectName && ` · ${r.subjectName}`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Actions for ${r.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog("rename")}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("move")}>
              <FolderInput /> Move to subject
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("tags")}>
              <Tag /> Edit tags
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {r.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {r.processing_status !== "ready" && (
          <Badge variant={status.variant} title={r.processing_error ?? undefined}>
            {r.processing_status !== "failed" && <Loader2 className="animate-spin" />}
            {status.label}
          </Badge>
        )}
        {r.suggestedSubjectName && !r.subject_id && <Badge variant="secondary">Suggested: {r.suggestedSubjectName}</Badge>}
        {r.tags.slice(0, 4).map((t) => (
          <Badge key={t} variant="muted">
            #{t}
          </Badge>
        ))}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "rename" ? "Rename resource" : dialog === "move" ? "Move to subject" : dialog === "tags" ? "Edit tags" : `Delete "${r.title}"?`}
            </DialogTitle>
          </DialogHeader>
          {dialog === "rename" && (
            <div className="space-y-1.5">
              <Label htmlFor={`t-${r.id}`}>Title</Label>
              <Input id={`t-${r.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </div>
          )}
          {dialog === "move" && (
            <select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {dialog === "tags" && (
            <div className="space-y-1.5">
              <Label htmlFor={`tags-${r.id}`}>Tags (comma separated)</Label>
              <Input id={`tags-${r.id}`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ias 16, summary, academy" />
            </div>
          )}
          {dialog === "delete" && <p className="text-sm text-muted-foreground">The file and its search index are removed permanently.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (dialog === "rename") save(() => updateResource(r.id, { title }), "Renamed");
                if (dialog === "move") save(() => updateResource(r.id, { subject_id: subject || null }), "Moved");
                if (dialog === "tags") save(() => updateResource(r.id, { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }), "Tags saved");
                if (dialog === "delete") save(() => deleteResource(r.id), "Deleted");
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              {dialog === "delete" ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
