import { spawn } from "node:child_process";
import { z } from "zod";
import { defineTool } from "../types";
import { AppError } from "@/lib/errors";

/**
 * Control the Windows PC KHOKHAR runs on: open apps, websites and folders; lock, sleep, restart,
 * shut down. Everything is WHITELISTED — no free-form commands are ever executed:
 *  - websites/URLs are opened with explorer.exe (no shell parsing, so "&" etc. can't inject commands)
 *  - apps are a fixed list of program names
 *  - power actions have fixed arguments; restart/shutdown need you to type CONFIRM.
 */

const SITES: Record<string, string> = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
  "google drive": "https://drive.google.com",
  drive: "https://drive.google.com",
  maps: "https://maps.google.com",
  "google maps": "https://maps.google.com",
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  whatsapp: "https://web.whatsapp.com",
  "whatsapp web": "https://web.whatsapp.com",
  tiktok: "https://www.tiktok.com",
  twitter: "https://x.com",
  x: "https://x.com",
  linkedin: "https://www.linkedin.com",
  github: "https://github.com",
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  gemini: "https://gemini.google.com",
  netflix: "https://www.netflix.com",
  wikipedia: "https://www.wikipedia.org",
  outlook: "https://outlook.live.com",
  "google meet": "https://meet.google.com",
  meet: "https://meet.google.com",
  zoom: "https://zoom.us",
  canva: "https://www.canva.com",
  daraz: "https://www.daraz.pk",
  news: "https://news.google.com",
};

/** name → [how to launch, value]. "start" = Windows `start` with a fixed program name. "uri" = protocol/shell URI. */
const APPS: Record<string, ["start" | "uri", string]> = {
  notepad: ["start", "notepad"],
  calculator: ["start", "calc"],
  calc: ["start", "calc"],
  paint: ["start", "mspaint"],
  "file explorer": ["start", "explorer"],
  explorer: ["start", "explorer"],
  "my files": ["start", "explorer"],
  "task manager": ["start", "taskmgr"],
  "command prompt": ["start", "cmd"],
  cmd: ["start", "cmd"],
  powershell: ["start", "powershell"],
  word: ["start", "winword"],
  "microsoft word": ["start", "winword"],
  excel: ["start", "excel"],
  "microsoft excel": ["start", "excel"],
  powerpoint: ["start", "powerpnt"],
  chrome: ["start", "chrome"],
  "google chrome": ["start", "chrome"],
  edge: ["start", "msedge"],
  "microsoft edge": ["start", "msedge"],
  firefox: ["start", "firefox"],
  vlc: ["start", "vlc"],
  "vs code": ["start", "code"],
  vscode: ["start", "code"],
  "visual studio code": ["start", "code"],
  settings: ["uri", "ms-settings:"],
  "wifi settings": ["uri", "ms-settings:network-wifi"],
  "bluetooth settings": ["uri", "ms-settings:bluetooth"],
  "sound settings": ["uri", "ms-settings:sound"],
  "display settings": ["uri", "ms-settings:display"],
  "windows update": ["uri", "ms-settings:windowsupdate"],
  camera: ["uri", "microsoft.windows.camera:"],
  calendar: ["uri", "outlookcal:"],
  mail: ["uri", "outlookmail:"],
  store: ["uri", "ms-windows-store:"],
  "microsoft store": ["uri", "ms-windows-store:"],
  photos: ["uri", "ms-photos:"],
  spotify: ["uri", "spotify:"],
  clock: ["uri", "ms-clock:"],
  alarm: ["uri", "ms-clock:"],
  downloads: ["uri", "shell:Downloads"],
  "downloads folder": ["uri", "shell:Downloads"],
  documents: ["uri", "shell:Personal"],
  "documents folder": ["uri", "shell:Personal"],
  desktop: ["uri", "shell:Desktop"],
  pictures: ["uri", "shell:My Pictures"],
  music: ["uri", "shell:My Music"],
  videos: ["uri", "shell:My Video"],
  "recycle bin": ["uri", "shell:RecycleBinFolder"],
  "control panel": ["start", "control"],
};

const URDU_NAMES: Record<string, string> = {
  "یوٹیوب": "youtube",
  "یو ٹیوب": "youtube",
  "گوگل": "google",
  "جی میل": "gmail",
  "فیس بک": "facebook",
  "انسٹاگرام": "instagram",
  "واٹس ایپ": "whatsapp",
  "ٹک ٹاک": "tiktok",
  "نوٹ پیڈ": "notepad",
  "کیلکولیٹر": "calculator",
  "ورڈ": "word",
  "ایکسل": "excel",
  "کروم": "chrome",
  "سیٹنگز": "settings",
  "سیٹنگ": "settings",
  "ڈاؤن لوڈز": "downloads",
  "ڈاؤنلوڈز": "downloads",
  "ڈاکومنٹس": "documents",
  "ڈیسک ٹاپ": "desktop",
  "تصاویر": "pictures",
  "کیمرہ": "camera",
  "فائلیں": "file explorer",
};

export type Resolved = { kind: "url"; value: string; label: string } | { kind: "start" | "uri"; value: string; label: string };

/** Map spoken names ("YouTube", "یوٹیوب", "notepad", a URL) to a whitelisted target. */
export function resolveTarget(raw: string): Resolved | null {
  let t = raw.trim().replace(/^(the|my|a)\s+/i, "").replace(/[.?!،۔]+$/, "").trim();
  if (URDU_NAMES[t]) t = URDU_NAMES[t];
  const lower = t.toLowerCase().replace(/\s+(app|application|website|site|page|program)$/, "").trim();
  const url = /^https?:\/\/[^\s"'<>]+$/i.exec(t)?.[0];
  if (url) return { kind: "url", value: url, label: url };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|pk|org|net|io|ai|dev|edu|gov|co|tv|me|app)(\/\S*)?$/i.test(lower)) return { kind: "url", value: `https://${lower}`, label: lower };
  if (APPS[lower]) return { kind: APPS[lower][0], value: APPS[lower][1], label: lower };
  if (SITES[lower]) return { kind: "url", value: SITES[lower], label: lower };
  return null;
}

function launch(r: Resolved) {
  // explorer.exe receives the URL/URI as a single argv entry — no shell, no injection.
  const child =
    r.kind === "start"
      ? spawn("cmd.exe", ["/c", "start", "", r.value], { detached: true, stdio: "ignore", windowsHide: true })
      : spawn("explorer.exe", [r.value], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

function requireWindows() {
  if (process.platform !== "win32") throw new AppError("PC control works when KHOKHAR runs on your Windows PC (it controls the computer it runs on).");
}

export const pcOpen = defineTool({
  name: "pc_open",
  description: "Open an app, website or folder on the Windows PC (YouTube, Notepad, Downloads, Settings, any https link…).",
  category: "system",
  risk: "low",
  input: z.object({ target: z.string().min(1).max(300) }),
  describe: (i) => `Open ${i.target} on your PC`,
  async execute(i) {
    const r = resolveTarget(i.target);
    if (!r) {
      const known = [...Object.keys(SITES).slice(0, 12), ...["notepad", "calculator", "word", "excel", "chrome", "settings", "downloads", "documents"]].join(", ");
      throw new AppError(`I don't know how to open "${i.target}" yet. I can open: ${known}, any website address, and more.`);
    }
    requireWindows();
    launch(r);
    return { opened: r.label, summary: `Opened ${r.label}`, markdown: `🖥️ Opened **${r.label}** on your PC.` };
  },
});

const powerActions = { lock: "low", sleep: "medium", restart: "high", shutdown: "high", cancel_shutdown: "low" } as const;

export const pcPower = defineTool({
  name: "pc_power",
  description: "Lock, sleep, restart or shut down the Windows PC (restart/shutdown need CONFIRM and give you 60 seconds).",
  category: "system",
  risk: (i: { action: keyof typeof powerActions }) => powerActions[i.action],
  input: z.object({ action: z.enum(["lock", "sleep", "restart", "shutdown", "cancel_shutdown"]) }),
  describe: (i) => ({ lock: "Lock your PC", sleep: "Put your PC to sleep", restart: "Restart your PC (in 60 seconds)", shutdown: "Shut down your PC (in 60 seconds)", cancel_shutdown: "Cancel a pending shutdown" })[i.action],
  async execute(i) {
    requireWindows();
    const cmd: Record<string, [string, string[]]> = {
      lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
      sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
      restart: ["shutdown.exe", ["/r", "/t", "60", "/c", "KHOKHAR: restarting in 60 seconds. Say 'KHOKHAR, cancel shutdown' to stop."]],
      shutdown: ["shutdown.exe", ["/s", "/t", "60", "/c", "KHOKHAR: shutting down in 60 seconds. Say 'KHOKHAR, cancel shutdown' to stop."]],
      cancel_shutdown: ["shutdown.exe", ["/a"]],
    };
    const [exe, args] = cmd[i.action];
    const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
    const msg = { lock: "PC locked.", sleep: "Going to sleep.", restart: "Restarting in 60 seconds.", shutdown: "Shutting down in 60 seconds.", cancel_shutdown: "Shutdown cancelled." }[i.action];
    return { summary: msg, markdown: `🖥️ ${msg}` };
  },
});

export const pcTools = [pcOpen, pcPower];
