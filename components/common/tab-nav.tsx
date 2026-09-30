import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs: each tab is a link, so only the active tab's data is fetched. */
export function TabNav({ tabs, active, base }: { tabs: { key: string; label: string; count?: number }[]; active: string; base: string }) {
  return (
    <nav aria-label="Sections" className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "bg-card text-foreground shadow-sm",
                )}
              >
                {t.label}
                {t.count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
