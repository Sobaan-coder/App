"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveNote } from "@/lib/actions/resources";
import { toast } from "sonner";

export function NoteEditor({
  id,
  initialTitle = "",
  initialContent = "",
  subjects,
  subjectId: initialSubject,
}: {
  id?: string;
  initialTitle?: string;
  initialContent?: string;
  subjects: { id: string; name: string }[];
  subjectId?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [subjectId, setSubjectId] = useState(initialSubject ?? "");
  const [pending, start] = useTransition();
  const dirty = title !== initialTitle || content !== initialContent || (initialSubject ?? "") !== subjectId;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveNote({ id, title, content, subject_id: subjectId || null });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Note saved — indexing for search");
          if (!id) router.push(`/resources/${res.id}`);
          else router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor="note-title">Title</Label>
          <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} placeholder="IAS 16 — revaluation summary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note-subject">Subject</Label>
          <select id="note-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note-content">Note</Label>
        <Textarea id="note-content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[50dvh] leading-relaxed" placeholder="Write or paste your notes…" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty || !title.trim()}>
          {pending && <Loader2 className="animate-spin" />} Save note
        </Button>
      </div>
    </form>
  );
}
