"use client";
import { Image as ImageIcon } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export default function MediaPage() {
  const { data } = useApi<{ files: { id: string; name: string; mime: string; tags: string[]; created_at: string }[] }>("/api/files?folder=media&limit=200");
  const images = (data?.files ?? []).filter((f) => f.mime.startsWith("image/"));
  return (
    <div>
      <PageHeader title="Media Library" icon={<ImageIcon className="h-6 w-6" />} subtitle="Generated images, screenshots and uploaded visuals." />
      {data && !images.length && (
        <Card>
          <Empty title="No media yet">Generated post images appear here.</Empty>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((f) => (
          <a key={f.id} href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-line bg-panel hover:border-accent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${f.id}?inline=1`} alt={f.name} loading="lazy" className="aspect-square w-full object-cover" />
            <div className="p-2">
              <div className="truncate text-xs">{f.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {f.tags.slice(0, 3).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted">{fmtDate(f.created_at, { dateStyle: "medium" })}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
