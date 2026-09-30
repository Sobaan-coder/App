import {
  LayoutDashboard, BookOpenCheck, Library, FolderOpen, FileQuestion, CalendarRange, CalendarDays,
  Repeat, BarChart3, Sparkles, Settings, ListChecks, Layers, ClipboardCheck, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/study", label: "My Study", icon: BookOpenCheck },
  { href: "/subjects", label: "Subjects", icon: Library },
  { href: "/resources", label: "Resources", icon: FolderOpen },
  { href: "/past-papers", label: "Past Papers", icon: FileQuestion },
  { href: "/planner", label: "Planner", icon: CalendarRange },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/revision", label: "Revision", icon: Repeat },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/tutor", label: "AI Tutor", icon: Sparkles },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/questions", label: "Question Bank", icon: ListChecks },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/deadlines", label: "Deadlines", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

// Mobile bottom navigation (spec: Home, Study, Planner, Resources, AI).
export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/study", label: "Study", icon: BookOpenCheck },
  { href: "/planner", label: "Planner", icon: CalendarRange },
  { href: "/resources", label: "Resources", icon: FolderOpen },
  { href: "/tutor", label: "AI", icon: Sparkles },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
