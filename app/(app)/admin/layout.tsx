import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/catalogue", "Catalogue"],
  ["/admin/jobs", "Processing jobs"],
  ["/admin/errors", "System errors"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <ShieldCheck className="size-3.5" /> Admin
        </span>
        <nav aria-label="Admin" className="flex flex-wrap gap-1">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mb-6 text-xs text-muted-foreground">Admins see platform metadata only. Students&apos; documents, notes and conversations are never shown here.</p>
      {children}
    </div>
  );
}
