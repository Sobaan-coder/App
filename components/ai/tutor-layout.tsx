import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TutorLayout({
  conversations,
  activeId,
  children,
  header,
}: {
  conversations: { id: string; title: string; updated_at: string }[];
  activeId?: string;
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Conversations">
        <Button asChild className="w-full">
          <Link href="/tutor">
            <MessageSquarePlus /> New conversation
          </Link>
        </Button>
        <ul className="mt-4 space-y-0.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/tutor/${c.id}`}
                className={cn("block rounded-xl px-3 py-2 text-sm hover:bg-accent", c.id === activeId && "bg-card font-medium shadow-sm ring-1 ring-border")}
                aria-current={c.id === activeId ? "page" : undefined}
              >
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(c.updated_at)}</span>
              </Link>
            </li>
          ))}
          {conversations.length === 0 && <li className="px-3 text-xs text-muted-foreground">No conversations yet.</li>}
        </ul>
      </aside>
      <div className="min-w-0">
        {header}
        {children}
      </div>
    </div>
  );
}
