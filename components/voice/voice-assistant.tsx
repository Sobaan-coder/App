"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ear, EarOff, Mic, Square, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/lib/client";
import { matchWakeWord, nameVariants } from "@/lib/wake";
import { VOICE_TEXT, type VoiceKey } from "@/services/language/replies";
import { cx } from "../ui";

/* ───────────────────────── types for the Web Speech API ───────────────────────── */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRCtor = new () => SpeechRec;

function recognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ───────────────────────── settings & helpers ───────────────────────── */
export interface AssistantSettings {
  name: string;
  urduName: string;
  aliases: string[];
  replyLanguage: "auto" | "en" | "ur" | "roman";
  voiceLanguage: string;
  speakReplies: boolean;
  voiceEngine: "browser" | "whisper";
  voiceRate: number;
}
type Lang = "en" | "ur" | "roman";
type Phase = "idle" | "wake" | "listening" | "thinking" | "speaking";

const URDU = /[؀-ۿ]/;
const WAKE_KEY = "cc-wake-enabled";

function chime(up = true) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(up ? 660 : 880, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(up ? 990 : 550, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* audio not available */
  }
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  if (lang === "ur") return voices.find((v) => v.lang.toLowerCase().startsWith("ur")) ?? null;
  if (lang === "roman") return voices.find((v) => /en[-_](in|pk)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  return voices.find((v) => v.lang.startsWith("en") && /google|natural|samantha|daniel/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
}

export function hasUrduVoice(): boolean {
  return Boolean(pickVoice("ur"));
}

/* ───────────────────────── context ───────────────────────── */
interface VoiceCtx {
  supported: boolean;
  settings: AssistantSettings | null;
  phase: Phase;
  wakeEnabled: boolean;
  setWakeEnabled: (v: boolean) => void;
  listenNow: () => void;
  submitText: (text: string) => Promise<void>;
  speak: (text: string, lang: Lang) => void;
  reloadSettings: () => void;
}
const Ctx = createContext<VoiceCtx | null>(null);
export const useVoice = () => useContext(Ctx);

interface CommandReply {
  runId: string;
  reply: string;
  replyLang: Lang;
  lang: Lang;
  understoodAs: string;
  intent: string;
}

export function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [panel, setPanel] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<{ text: string; lang: Lang } | null>(null);
  const [understood, setUnderstood] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wakeEnabled, setWakeState] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);

  const recRef = useRef<SpeechRec | null>(null);
  const wakeRef = useRef(false);
  const awaitingCommand = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const failures = useRef(0);
  const settingsRef = useRef<AssistantSettings | null>(null);
  settingsRef.current = settings;
  const supported = typeof window !== "undefined" && (Boolean(recognitionCtor()) || Boolean(navigator.mediaDevices));

  const loadSettings = useCallback(async () => {
    try {
      const r = await api<{ settings: { assistant: AssistantSettings } }>("/api/settings");
      setSettings(r.settings.assistant);
    } catch {
      /* not signed in yet */
    }
  }, []);
  useEffect(() => {
    void loadSettings();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices(); // warm up voice list
  }, [loadSettings]);

  const uiLang = (l?: Lang): Lang => l ?? (settings?.replyLanguage && settings.replyLanguage !== "auto" ? settings.replyLanguage : settings?.voiceLanguage.startsWith("ur") ? "ur" : "en");
  const t = (k: VoiceKey, l?: Lang) => VOICE_TEXT[k][uiLang(l)];

  /* ── text to speech ── */
  const speak = useCallback(
    (text: string, lang: Lang) => {
      if (muted || !settingsRef.current?.speakReplies || typeof speechSynthesis === "undefined" || !text.trim()) return;
      const clean = text.replace(/[*_`#>|]/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 400);
      const effective: Lang = URDU.test(clean) ? "ur" : lang === "ur" ? "en" : lang;
      const voice = pickVoice(effective);
      if (effective === "ur" && !voice) return; // no Urdu voice on this device: text is shown instead
      const u = new SpeechSynthesisUtterance(clean);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = settingsRef.current?.voiceRate ?? 1;
      speakingRef.current = true;
      setPhase("speaking");
      try {
        recRef.current?.abort();
      } catch {
        /* not running */
      }
      u.onend = u.onerror = () => {
        speakingRef.current = false;
        setPhase(wakeRef.current ? "wake" : "idle");
        if (wakeRef.current) startWakeLoop();
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [muted],
  );

  /* ── follow the run and speak the outcome ── */
  const follow = useCallback(
    async (r: CommandReply) => {
      for (let i = 0; i < 120; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        let data: { run: { status: string; result: { summary?: string; markdown?: string } | null; error: string | null } };
        try {
          data = await api(`/api/runs/${r.runId}`);
        } catch {
          return;
        }
        const s = data.run.status;
        if (s === "completed") {
          const summary = data.run.result?.summary ?? "";
          const md = data.run.result?.markdown ?? "";
          if (r.intent === "identity" || r.intent === "greeting") {
            setReply({ text: md, lang: r.replyLang });
            speak(md, r.replyLang);
          } else {
            const text = r.replyLang === "en" ? `${VOICE_TEXT.done.en} ${summary}` : VOICE_TEXT.done[r.replyLang];
            setReply({ text: r.replyLang === "en" ? text : `${text}\n${summary}`, lang: r.replyLang });
            speak(text, r.replyLang);
          }
          return;
        }
        if (s === "approval_required") {
          setReply({ text: VOICE_TEXT.approval[r.replyLang], lang: r.replyLang });
          speak(VOICE_TEXT.approval[r.replyLang], r.replyLang);
          return;
        }
        if (s === "failed" || s === "cancelled") {
          const msg = `${VOICE_TEXT.failed[r.replyLang]} ${data.run.error ?? ""}`;
          setReply({ text: msg, lang: r.replyLang });
          speak(VOICE_TEXT.failed[r.replyLang], r.replyLang);
          return;
        }
      }
    },
    [speak],
  );

  /* ── send a command ── */
  const submitText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (clean.length < 2 || busyRef.current) return;
      busyRef.current = true;
      setPanel(true);
      setTranscript(clean);
      setReply(null);
      setUnderstood(null);
      setError(null);
      setPhase("thinking");
      try {
        const r = await api<CommandReply>("/api/command", { body: { text: clean } });
        setRunId(r.runId);
        if (r.lang !== "en" && r.understoodAs !== clean) setUnderstood(r.understoodAs);
        setReply({ text: r.reply, lang: r.replyLang });
        speak(r.reply, r.replyLang);
        void follow(r);
      } catch (e) {
        setError((e as Error).message);
        setPhase(wakeRef.current ? "wake" : "idle");
      } finally {
        busyRef.current = false;
        if (!speakingRef.current) setPhase(wakeRef.current ? "wake" : "idle");
      }
    },
    [follow, speak],
  );

  /* ── handle a final transcript from the microphone ── */
  const onFinal = useCallback(
    (text: string) => {
      const s = settingsRef.current;
      if (!s) return;
      if (awaitingCommand.current) {
        awaitingCommand.current = false;
        void submitText(text);
        return;
      }
      if (!wakeRef.current) return;
      const m = matchWakeWord(text, nameVariants(s.name, [s.urduName, ...s.aliases]));
      if (!m.matched) return;
      chime(true);
      setPanel(true);
      if (m.command.trim().length >= 2) void submitText(m.command);
      else {
        awaitingCommand.current = true;
        setPhase("listening");
        setTranscript("");
        const l: Lang = s.voiceLanguage.startsWith("ur") ? "ur" : "en";
        setReply({ text: VOICE_TEXT.yes[l], lang: l });
        speak(VOICE_TEXT.yes[l], l);
        setTimeout(() => {
          if (awaitingCommand.current) {
            awaitingCommand.current = false;
            setPhase(wakeRef.current ? "wake" : "idle");
          }
        }, 9000);
      }
    },
    [speak, submitText],
  );

  /* ── browser speech recognition (Chrome, Edge, Safari) ── */
  const makeRecognizer = useCallback(
    (continuous: boolean) => {
      const C = recognitionCtor();
      if (!C) return null;
      const r = new C();
      r.lang = settingsRef.current?.voiceLanguage ?? "ur-PK";
      r.continuous = continuous;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        if (failures.current) {
          failures.current = 0;
          setError(null);
        }
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) onFinal(res[0].transcript);
          else interim += res[0].transcript;
        }
        if (interim && (awaitingCommand.current || !wakeRef.current)) setTranscript(interim);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          wakeRef.current = false;
          setWakeState(false);
          try {
            localStorage.setItem(WAKE_KEY, "0");
          } catch {
            /* ignore */
          }
          setError(t("noMic"));
          setPhase("idle");
        } else if (e.error === "network" || e.error === "audio-capture") {
          failures.current = Math.min(failures.current + 1, 8);
          setError(e.error === "network" ? "Speech recognition needs an internet connection — retrying…" : "No microphone found — retrying…");
        }
      };
      return r;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFinal, settings],
  );

  const startWakeLoop = useCallback(() => {
    if (!wakeRef.current || speakingRef.current) return;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    const r = makeRecognizer(true);
    if (!r) return;
    r.onend = () => {
      // Chrome stops continuous recognition periodically — restart while wake mode is on.
      // back off after failures (no internet / mic not ready yet at boot): 0.25s → up to ~60s
      const delay = failures.current ? Math.min(60_000, 1000 * 2 ** failures.current) : 250;
      if (wakeRef.current && !speakingRef.current) setTimeout(() => wakeRef.current && !speakingRef.current && startWakeLoop(), delay);
    };
    recRef.current = r;
    try {
      r.start();
      setPhase((p) => (p === "idle" ? "wake" : p));
    } catch {
      /* already started */
    }
  }, [makeRecognizer]);

  const setWakeEnabled = useCallback(
    (v: boolean) => {
      wakeRef.current = v;
      setWakeState(v);
      try {
        localStorage.setItem(WAKE_KEY, v ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (v) {
        if (!recognitionCtor()) {
          setError("Hands-free wake word needs Chrome, Edge or Safari. You can still tap the mic.");
          wakeRef.current = false;
          setWakeState(false);
          return;
        }
        chime(true);
        startWakeLoop();
      } else {
        try {
          recRef.current?.abort();
        } catch {
          /* ignore */
        }
        setPhase("idle");
      }
    },
    [startWakeLoop],
  );

  // "Talk to KHOKHAR" home-screen shortcut (/?voice=1) opens straight into listening
  useEffect(() => {
    if (!settings || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("voice") === "1") {
      url.searchParams.delete("voice");
      window.history.replaceState(null, "", url.pathname + url.search);
      listenNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.name]);

  // restore wake mode per device (mic permission is per device/browser)
  useEffect(() => {
    if (!settings) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("wake") === "1") {
        url.searchParams.delete("wake");
        window.history.replaceState(null, "", url.pathname + url.search);
        setWakeEnabled(true);
      } else if (localStorage.getItem(WAKE_KEY) === "1") setWakeEnabled(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.name, settings?.voiceLanguage]);

  /* ── Whisper (server) recording fallback ── */
  const recordWithWhisper = useCallback(async () => {
    if (mediaRef.current) {
      mediaRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        mediaRef.current = null;
        setRecording(false);
        setPhase("thinking");
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "speech.webm");
        form.append("language", settingsRef.current?.voiceLanguage.slice(0, 2) ?? "");
        try {
          const r = await api<{ text: string }>("/api/voice/transcribe", { form });
          if (!r.text) throw new Error(t("notUnderstood"));
          const s = settingsRef.current!;
          const m = matchWakeWord(r.text, nameVariants(s.name, [s.urduName, ...s.aliases]));
          await submitText(m.matched && m.command ? m.command : r.text);
        } catch (e) {
          setError((e as Error).message);
          setPhase("idle");
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setPhase("listening");
      setTimeout(() => rec.state === "recording" && rec.stop(), 15_000);
    } catch {
      setError(t("noMic"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitText]);

  /* ── push to talk ── */
  const listenNow = useCallback(() => {
    setPanel(true);
    setError(null);
    setReply(null);
    setUnderstood(null);
    setTranscript("");
    const s = settingsRef.current;
    if (s?.voiceEngine === "whisper" || !recognitionCtor()) {
      void recordWithWhisper();
      return;
    }
    chime(true);
    if (wakeRef.current) {
      awaitingCommand.current = true;
      setPhase("listening");
      return;
    }
    const r = makeRecognizer(false);
    if (!r) return;
    awaitingCommand.current = true;
    r.onend = () => {
      awaitingCommand.current = false;
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    recRef.current = r;
    setPhase("listening");
    try {
      r.start();
    } catch {
      /* ignore */
    }
  }, [makeRecognizer, recordWithWhisper]);

  const value = useMemo<VoiceCtx>(
    () => ({ supported, settings, phase, wakeEnabled, setWakeEnabled, listenNow, submitText, speak, reloadSettings: loadSettings }),
    [supported, settings, phase, wakeEnabled, setWakeEnabled, listenNow, submitText, speak, loadSettings],
  );

  const name = settings?.name ?? "KHOKHAR";
  const l = uiLang(reply?.lang);
  const status =
    phase === "listening" ? t("listening") : phase === "thinking" ? t("thinking") : phase === "speaking" ? "…" : wakeEnabled ? `Say “${name}”${settings?.urduName ? ` · “${settings.urduName}”` : ""}` : "";

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* floating orb button */}
      <button
        onClick={() => (panel ? listenNow() : (setPanel(true), listenNow()))}
        aria-label={`Talk to ${name}`}
        title={`Talk to ${name}`}
        className={cx(
          "fixed right-4 bottom-24 z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-xl transition lg:bottom-6",
          "bg-gradient-to-br from-[#8b6dff] via-[#6d4aff] to-[#c8891c]",
          (phase === "listening" || recording) && "scale-110 ring-4 ring-accent/40",
        )}
      >
        {phase === "listening" || recording ? <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" /> : null}
        {wakeEnabled && phase === "wake" && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg bg-ok" />}
        {recording ? <Square className="relative h-5 w-5" /> : <Mic className="relative h-6 w-6" />}
      </button>

      {/* assistant panel */}
      {panel && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:inset-x-auto sm:right-4 sm:bottom-24 sm:w-[24rem] sm:px-0 sm:pb-0 lg:bottom-24">
          <div className="overflow-hidden rounded-3xl border border-line bg-panel/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{name}</span>
                {settings?.urduName && <span className="urdu text-base font-normal text-muted">{settings.urduName}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-1.5 text-muted hover:bg-panel-2" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute voice replies" : "Mute voice replies"} title={muted ? "Unmute" : "Mute"}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  className={cx("rounded-lg p-1.5 hover:bg-panel-2", wakeEnabled ? "text-ok" : "text-muted")}
                  onClick={() => setWakeEnabled(!wakeEnabled)}
                  aria-label={wakeEnabled ? "Stop listening for the wake word" : `Listen for “${name}”`}
                  title={wakeEnabled ? "Wake word ON" : `Hands-free: listen for “${name}”`}
                >
                  {wakeEnabled ? <Ear className="h-4 w-4" /> : <EarOff className="h-4 w-4" />}
                </button>
                <button
                  className="rounded-lg p-1.5 text-muted hover:bg-panel-2"
                  onClick={() => {
                    setPanel(false);
                    awaitingCommand.current = false;
                    if (!wakeRef.current) recRef.current?.abort();
                    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
                  }}
                  aria-label="Close assistant"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center px-5 pt-3 pb-5 text-center">
              {/* orb */}
              <button onClick={listenNow} aria-label="Speak" className="relative my-2 grid h-24 w-24 place-items-center">
                <span
                  className={cx(
                    "absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#8b6dff,#c8891c,#4b2fd1,#8b6dff)] opacity-90 blur-[2px]",
                    phase === "listening" || recording ? "animate-spin [animation-duration:2.5s]" : phase === "thinking" ? "animate-spin [animation-duration:1s]" : phase === "speaking" ? "animate-pulse" : "",
                  )}
                />
                <span className="absolute inset-[6px] rounded-full bg-panel" />
                <Mic className={cx("relative h-8 w-8", phase === "listening" || recording ? "text-accent" : "text-muted")} />
              </button>
              <div className="min-h-5 text-xs text-muted">{status}</div>
              {transcript && (
                <p dir="auto" className={cx("mt-3 text-base font-medium break-words", URDU.test(transcript) && "urdu text-lg")}>
                  {URDU.test(transcript) ? transcript : `“${transcript}”`}
                </p>
              )}
              {understood && <p className="mt-1 text-[11px] text-muted">Understood as: {understood}</p>}
              {reply && (
                <div className="mt-3 space-y-1">
                  {reply.text
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line, i) => (
                      <p key={i} dir="auto" className={cx("text-sm break-words", URDU.test(line) ? "urdu text-base" : i > 0 && "text-xs text-muted")}>
                        {line}
                      </p>
                    ))}
                </div>
              )}
              {error && <p className="mt-3 text-xs text-bad">{error}</p>}
              {runId && (
                <Link href={`/runs/${runId}`} className="mt-3 text-xs font-medium text-accent" onClick={() => setPanel(false)}>
                  {l === "ur" ? "تفصیل دیکھیں" : l === "roman" ? "Tafseel dekhein" : "Open details"} →
                </Link>
              )}
              {!supported && <p className="mt-3 text-xs text-muted">Voice isn't supported in this browser. Type your command instead.</p>}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Small header pill shown while hands-free listening is on. */
export function WakeIndicator() {
  const v = useVoice();
  if (!v?.wakeEnabled) return null;
  return (
    <button onClick={() => v.setWakeEnabled(false)} className="hidden items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok md:inline-flex" title="Click to stop listening">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
      Listening for “{v.settings?.name}”
    </button>
  );
}
