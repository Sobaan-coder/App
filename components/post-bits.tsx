"use client";
import { Image as ImageIcon } from "lucide-react";
import { StatusBadge } from "./ui";

export const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", snapchat: "Snapchat" };

export interface PostRow {
  id: string;
  title: string;
  idea: string;
  status: string;
  content_category: string;
  platforms: string[];
  scheduled_at: string | null;
  created_at: string;
  published_at: string | null;
  brand_name: string | null;
  product_name: string | null;
  image_file_id: string | null;
  image_provider: string | null;
  jobs: { platform: string; status: string; url: string | null; error: string | null }[] | null;
}

export function Thumb({ fileId, className }: { fileId: string | null; className?: string }) {
  if (!fileId)
    return (
      <div className={`grid place-items-center bg-panel-2 text-muted ${className ?? ""}`}>
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/files/${fileId}?inline=1`} alt="" loading="lazy" className={`object-cover ${className ?? ""}`} />;
}

export function PostStatus({ status }: { status: string }) {
  return <StatusBadge status={status} label={status.toUpperCase()} />;
}
