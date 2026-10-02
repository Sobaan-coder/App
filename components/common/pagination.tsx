import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pageCount, makeHref }: { page: number; pageCount: number; makeHref: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
      <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : undefined}>
        <Link href={makeHref(page - 1)} scroll={false}>
          <ChevronLeft /> Previous
        </Link>
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {pageCount}
      </span>
      <Button asChild variant="outline" size="sm" aria-disabled={page >= pageCount} className={page >= pageCount ? "pointer-events-none opacity-50" : undefined}>
        <Link href={makeHref(page + 1)} scroll={false}>
          Next <ChevronRight />
        </Link>
      </Button>
    </nav>
  );
}
