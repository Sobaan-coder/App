"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Safe markdown (react-markdown never renders raw HTML). [S#] citation markers
 * become links to the cited source.
 */
export function Markdown({ text, sources = [], className }: { text: string; sources?: { n: number; href: string; title: string; page: number | null }[]; className?: string }) {
  const bySource = new Map(sources.map((s) => [s.n, s]));
  const withLinks = text.replace(/\[S(\d+)\]/g, (m, n) => (bySource.has(Number(n)) ? `[${n}](#cite-${n})` : ""));
  return (
    <div
      className={cn(
        "prose-sm max-w-none text-sm leading-relaxed [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-3 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_strong]:font-semibold",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("#cite-")) {
              const s = bySource.get(Number(href.slice(6)));
              if (!s) return null;
              return (
                <a href={s.href} className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/10 px-1 align-super text-[10px] font-semibold text-primary no-underline hover:bg-primary/20" title={`${s.title}${s.page ? ` — page ${s.page}` : ""}`}>
                  {children}
                </a>
              );
            }
            const safe = href && /^https?:\/\//.test(href) ? href : undefined;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {withLinks}
      </ReactMarkdown>
    </div>
  );
}
