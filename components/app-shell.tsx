"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  Brain,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Cpu,
  FileText,
  FolderKanban,
  Gauge,
  HeartPulse,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  ListOrdered,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Package,
  PieChart,
  Settings,
  ShieldCheck,
  Share2,
  Sun,
  Users,
  Workflow,
  X,
  History,
} from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { cx, ToastProvider } from "./ui";
import { VoiceAssistantProvider, WakeIndicator } from "./voice/voice-assistant";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "approvals";
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Command",
    items: [
      { href: "/", label: "Command Center", icon: Home },
      { href: "/queue", label: "Work Queue", icon: ListOrdered },
      { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/files", label: "Files", icon: FileText },
      { href: "/memory", label: "Memory", icon: Brain },
    ],
  },
  {
    group: "Content Studio",
    items: [
      { href: "/content", label: "Content", icon: Megaphone },
      { href: "/content/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/content/queue", label: "Content Queue", icon: LayoutGrid },
      { href: "/content/media", label: "Media", icon: ImageIcon },
      { href: "/content/brands", label: "Brands & Products", icon: Package },
      { href: "/content/accounts", label: "Social Accounts", icon: Share2 },
      { href: "/content/analytics", label: "Analytics", icon: PieChart },
      { href: "/content/history", label: "History", icon: History },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/activity", label: "Activity Log", icon: Activity },
      { href: "/usage", label: "AI Usage & Cost", icon: Gauge },
      { href: "/health", label: "System Health", icon: HeartPulse },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/admin", label: "Admin", icon: Users },
    ],
  },
];

const MOBILE: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/content") return path === "/content" || path.startsWith("/content/posts");
  return path === href || path.startsWith(`${href}/`);
}

interface Notif {
  id: string;
  title: string;
  body: string;
  level: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cc-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  return { dark, toggle };
}

export function AppShell({ user, children }: { user: { name: string; email: string; role: string }; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const { dark, toggle } = useTheme();
  const notifs = useApi<{ notifications: Notif[]; unread: number }>("/api/notifications", 15_000);
  const dash = useApi<{ counts: { pending_approvals: number }; status: { ai: string; worker: string; automationsPaused: boolean } }>("/api/dashboard", 20_000);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Browser notifications for new unread items (after the first load).
  useEffect(() => {
    const list = notifs.data?.notifications ?? [];
    if (!notifs.data) return;
    if (seen.current === null) {
      seen.current = new Set(list.map((n) => n.id));
      return;
    }
    for (const n of list) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.read_at && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const note = new Notification(n.title, { body: n.body.slice(0, 180), icon: "/icon.svg", tag: n.id });
        note.onclick = () => {
          window.focus();
          if (n.link) router.push(n.link);
        };
      }
    }
  }, [notifs.data, router]);

  const approvals = dash.data?.counts.pending_approvals ?? 0;
  const aiOnline = dash.data?.status.ai === "model";
  const workerOnline = dash.data?.status.worker === "online";

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#8b6dff] to-[#4b2fd1] text-white shadow-md">
          <Bot className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-wide">MY AI COMMAND CENTER</div>
          <div className="text-[11px] text-muted">Your digital employee</div>
        </div>
      </Link>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {NAV.filter((g) => g.group !== "System" || true).map((g) => (
          <div key={g.group}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80">{g.group}</div>
            {g.items
              .filter((i) => i.href !== "/admin" || user.role === "admin")
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cx(
                    "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition",
                    isActive(path, i.href) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-panel-2 hover:text-ink",
                  )}
                >
                  <i.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.badge === "approvals" && approvals > 0 && <span className="rounded-full bg-warn px-1.5 text-[10px] font-bold text-white">{approvals}</span>}
                </Link>
              ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 text-xs font-bold uppercase">{user.name.slice(0, 2)}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-semibold">{user.name}</div>
            <div className="truncate text-[11px] text-muted">{user.email}</div>
          </div>
          <button onClick={logout} className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink" title="Log out" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <ToastProvider>
      <VoiceAssistantProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-panel lg:block">{sidebar}</aside>
        {drawer && (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setDrawer(false)}>
            <aside className="h-full w-72 max-w-[85vw] border-r border-line bg-panel" onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-4 right-4 rounded-lg p-1 text-white" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/80 px-3 backdrop-blur-md sm:px-5">
            <button className="rounded-lg p-2 text-muted hover:bg-panel-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="text-sm font-bold tracking-wide lg:hidden">
              AI COMMAND CENTER
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <WakeIndicator />
              <Link
                href="/health"
                className={cx("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex", aiOnline ? "border-ok/30 bg-ok/10 text-ok" : "border-gold/30 bg-gold/10 text-gold")}
                title={aiOnline ? "An AI model is connected" : "No AI model connected — the free offline engine is handling your commands"}
              >
                <span className={cx("h-1.5 w-1.5 rounded-full", aiOnline ? "bg-ok" : "bg-gold")} />
                {aiOnline ? "AI ONLINE" : "AI ONLINE · $0 MODE"}
              </Link>
              {dash.data && !workerOnline && (
                <Link href="/health" className="hidden items-center gap-1.5 rounded-full border border-bad/30 bg-bad/10 px-2.5 py-1 text-[11px] font-semibold text-bad sm:inline-flex">
                  <Cpu className="h-3 w-3" /> WORKER OFFLINE
                </Link>
              )}
              {dash.data?.status.automationsPaused && <span className="hidden rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold text-warn md:inline">AUTOMATIONS PAUSED</span>}
              <button onClick={toggle} className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <div className="relative">
                <button onClick={() => setBellOpen((v) => !v)} className="relative rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {(notifs.data?.unread ?? 0) > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-bad" />}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
                    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                      <span className="text-sm font-semibold">Notifications</span>
                      <div className="flex gap-2 text-xs">
                        {typeof Notification !== "undefined" && Notification.permission === "default" && (
                          <button className="text-accent" onClick={() => Notification.requestPermission()}>
                            Enable browser alerts
                          </button>
                        )}
                        <button
                          className="text-muted hover:text-ink"
                          onClick={async () => {
                            await api("/api/notifications", { body: { all: true } });
                            notifs.reload();
                          }}
                        >
                          Mark all read
                        </button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto scrollbar-thin">
                      {(notifs.data?.notifications ?? []).length === 0 && <div className="p-6 text-center text-xs text-muted">Nothing yet.</div>}
                      {(notifs.data?.notifications ?? []).map((n) => (
                        <button
                          key={n.id}
                          onClick={async () => {
                            setBellOpen(false);
                            await api("/api/notifications", { body: { ids: [n.id] } });
                            notifs.reload();
                            if (n.link) router.push(n.link);
                          }}
                          className={cx("flex w-full gap-3 border-b border-line px-4 py-3 text-left hover:bg-panel-2", !n.read_at && "bg-accent-soft/40")}
                        >
                          <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.level === "error" ? "bg-bad" : n.level === "warning" ? "bg-warn" : n.level === "success" ? "bg-ok" : "bg-accent")} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold">{n.title}</span>
                            {n.body && <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>}
                            <span className="text-[10px] text-muted">{timeAgo(n.created_at)}</span>
                          </span>
                          {n.link && <ChevronRight className="h-4 w-4 self-center text-muted" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-28 sm:px-6 sm:pt-6 lg:pb-10">{children}</main>
        </div>

        {/* mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-5">
            {MOBILE.map((i) => (
              <Link key={i.href} href={i.href} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", isActive(path, i.href) ? "text-accent" : "text-muted")}>
                <i.icon className="h-5 w-5" />
                {i.label}
                {i.badge === "approvals" && approvals > 0 && <span className="absolute top-1 right-[28%] rounded-full bg-warn px-1 text-[9px] font-bold text-white">{approvals}</span>}
              </Link>
            ))}
            <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted">
              <Menu className="h-5 w-5" />
              More
            </button>
          </div>
        </nav>
      </div>
      </VoiceAssistantProvider>
    </ToastProvider>
  );
}
