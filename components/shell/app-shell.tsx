"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, PanelLeftClose, PanelLeftOpen, MoreHorizontal } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "./user-menu";
import { CommandBar } from "@/components/ai/command-bar";
import { ADMIN_NAV, MOBILE_NAV, PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav-items";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  user: { name: string; email: string; isAdmin: boolean };
};

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const link = (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-card text-foreground shadow-sm ring-1 ring-border",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className={cn("size-[18px] shrink-0", active && "text-primary")} aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarNav({ collapsed, isAdmin, onNavigate }: { collapsed?: boolean; isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4 scrollbar-none">
      <div className="space-y-0.5">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="space-y-0.5">
        {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-muted-foreground/70">More</p>}
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {isAdmin && <NavLink item={ADMIN_NAV} collapsed={collapsed} onNavigate={onNavigate} />}
      </div>
    </nav>
  );
}

export function AppShell({ children, user }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <Link href="/dashboard" aria-label="Study OS home">
              <LogoMark />
            </Link>
          ) : (
            <Logo href="/dashboard" />
          )}
        </div>
        <SidebarNav collapsed={collapsed} isAdmin={user.isAdmin} />
        <div className={cn("border-t p-3", collapsed && "flex justify-center")}>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={toggle} className={cn(!collapsed && "w-full justify-start text-muted-foreground")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "md:pl-[68px]" : "md:pl-60")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link href="/dashboard" className="sm:hidden" aria-label="Study OS home">
            <LogoMark />
          </Link>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-10 flex-1 items-center gap-3 rounded-xl border bg-card px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:max-w-md"
            aria-label="Open command bar"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">What do you need to study?</span>
            <kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>

        <main id="main" className="flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="grid grid-cols-6">
          {MOBILE_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} prefetch={false} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground" aria-label="More navigation">
            <MoreHorizontal className="size-5" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center px-4">
            <Logo href="/dashboard" />
          </div>
          <SidebarNav isAdmin={user.isAdmin} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
