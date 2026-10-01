"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Megaphone, Sparkles } from "lucide-react";
import { api, fmtDate, useApi } from "@/lib/client";
import { RunView } from "@/components/run-view";
import { PLATFORM_LABEL, PostStatus, Thumb, type PostRow } from "@/components/post-bits";
import { Button, Card, CardHeader, Empty, Input, PageHeader, Select, useToast } from "@/components/ui";

const QUICK = ["Create today's Merchants content.", "Create a post for Crown Crust Pizza.", "Make a viral-style burger post.", "Create content for all platforms.", "Create 7 days of content.", "Show scheduled posts.", "Show failed posts.", "Create a campaign for Buy 1 Get 1 Pizza."];

export default function ContentHome() {
  const toast = useToast();
  const [cmd, setCmd] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const posts = useApi<{ posts: PostRow[] }>("/api/content/posts", 8000);
  const products = useApi<{ products: { id: string; name: string; available: boolean; price: string | null }[] }>("/api/content/products");
  const [product, setProduct] = useState("");
  const list = posts.data?.posts ?? [];
  const today = new Date().toDateString();
  const isToday = (p: PostRow) => new Date(p.scheduled_at ?? p.created_at).toDateString() === today;
  const cols = [
    { key: "ready", label: "READY", items: list.filter((p) => ["approval", "draft", "approved"].includes(p.status)) },
    { key: "scheduled", label: "SCHEDULED", items: list.filter((p) => p.status === "scheduled") },
    { key: "published", label: "PUBLISHED", items: list.filter((p) => p.status === "published" && isToday(p)) },
    { key: "failed", label: "FAILED", items: list.filter((p) => p.status === "failed") },
  ];

  const run = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ runId: string }>("/api/command", { body: { text } });
      setRunId(r.runId);
      setCmd("");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Content Studio"
        icon={<Megaphone className="h-6 w-6" />}
        subtitle="Brand-aware posts with images, platform-specific captions and quality checks. Nothing is published without your approval."
        actions={
          <Link href="/content/calendar" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-panel px-4 text-sm">
            <CalendarDays className="h-4 w-4" /> Calendar
          </Link>
        }
      />
      <Card className="p-4 sm:p-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(cmd);
          }}
        >
          <Input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Create today's Merchants post about the Crown Crust Pizza and publish it to Instagram and Facebook" className="h-11" />
          <Button variant="primary" size="lg" loading={busy} type="submit">
            <Sparkles className="h-4 w-4" /> Create
          </Button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {QUICK.map((q) => (
            <button key={q} onClick={() => run(q)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-ink">
              {q}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          Or pick a product:
          <Select value={product} onChange={(e) => setProduct(e.target.value)} className="h-8 w-56 text-xs">
            <option value="">Choose…</option>
            {products.data?.products.map((p) => (
              <option key={p.id} value={p.name} disabled={!p.available}>
                {p.name}
                {!p.available ? " (unavailable)" : p.price === null ? " (no price set)" : ""}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={!product} onClick={() => run(`Create a post for ${product}`)}>
            Generate post
          </Button>
        </div>
      </Card>
      {runId && <RunView runId={runId} compact onChange={posts.reload} />}

      <div>
        <h2 className="mb-3 text-sm font-semibold">TODAY'S CONTENT</h2>
        <div className="grid gap-3 md:grid-cols-4">
          {cols.map((c) => (
            <Card key={c.key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[11px] font-bold tracking-wider">
                {c.label} <span className="text-muted">{c.items.length}</span>
              </div>
              <div className="max-h-80 divide-y divide-line overflow-y-auto scrollbar-thin">
                {!c.items.length && <div className="p-4 text-center text-xs text-muted">—</div>}
                {c.items.slice(0, 20).map((p) => (
                  <Link key={p.id} href={`/content/posts/${p.id}`} className="flex items-center gap-2 p-2.5 hover:bg-panel-2">
                    <Thumb fileId={p.image_file_id} className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{p.title}</div>
                      <div className="truncate text-[10px] text-muted">{p.scheduled_at ? fmtDate(p.scheduled_at) : p.platforms.map((x) => PLATFORM_LABEL[x]).join(", ")}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title="Recent posts" action={<Link href="/content/queue" className="text-xs text-accent">Content queue</Link>} />
        {posts.data && !list.length && <Empty title="No posts yet">Try “Create today's Merchants content”.</Empty>}
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {list.slice(0, 8).map((p) => (
            <Link key={p.id} href={`/content/posts/${p.id}`} className="overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-accent/50">
              <Thumb fileId={p.image_file_id} className="aspect-[4/5] w-full" />
              <div className="space-y-1 p-3">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="flex items-center justify-between">
                  <PostStatus status={p.status} />
                  <span className="text-[10px] text-muted">{p.content_category}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
