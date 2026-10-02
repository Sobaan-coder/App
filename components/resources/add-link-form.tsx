"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function AddLinkForm({ subjects, defaultSubjectId, onAdded }: { subjects: { id: string; name: string }[]; defaultSubjectId?: string | null; onAdded?: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await fetch("/api/resources/link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, title: title || undefined, description: description || undefined, subject_id: subjectId || null }),
        });
        const json = await res.json();
        setBusy(false);
        if (!res.ok) return void toast.error(json.error);
        toast.success("Link added");
        setUrl("");
        setTitle("");
        setDescription("");
        onAdded?.(json.id);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="link-url">Link</Label>
        <Input id="link-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube lecture, website or Google Drive link" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="link-title">Title (optional)</Label>
          <Input id="link-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Fetched automatically" />
        </div>
        {subjects.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="link-subject">Subject</Label>
            <select id="link-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">Let Study OS suggest it</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="link-desc">What&apos;s in it? (optional — helps the AI tutor)</Label>
        <Textarea id="link-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="min-h-16" placeholder="e.g. Sir Ahmed's IAS 16 revaluation lecture, covers excess depreciation transfer" />
      </div>
      <Button type="submit" disabled={busy || !url}>
        {busy && <Loader2 className="animate-spin" />} Add link
      </Button>
    </form>
  );
}
