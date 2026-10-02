"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Link2, NotebookPen, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceUploader } from "./resource-uploader";
import { AddLinkForm } from "./add-link-form";

export function AddResourceDialog({ subjects, defaultSubjectId, defaultOpen = false }: { subjects: { id: string; name: string }[]; defaultSubjectId?: string | null; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add resources
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to your library</DialogTitle>
          <DialogDescription>Study OS extracts the text, links it to your syllabus topics and makes it searchable by the AI tutor.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload">
              <Upload /> Files
            </TabsTrigger>
            <TabsTrigger value="link">
              <Link2 /> Link
            </TabsTrigger>
            <TabsTrigger value="note">
              <NotebookPen /> Note
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <ResourceUploader subjects={subjects} defaultSubjectId={defaultSubjectId} onUploaded={() => router.refresh()} />
          </TabsContent>
          <TabsContent value="link">
            <AddLinkForm
              subjects={subjects}
              defaultSubjectId={defaultSubjectId}
              onAdded={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </TabsContent>
          <TabsContent value="note" className="space-y-3">
            <p className="text-sm text-muted-foreground">Write notes in Study OS — they&apos;re searchable and the tutor can cite them.</p>
            <Button asChild>
              <Link href={`/resources/notes/new${defaultSubjectId ? `?subject=${defaultSubjectId}` : ""}`}>
                <NotebookPen /> New note
              </Link>
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
