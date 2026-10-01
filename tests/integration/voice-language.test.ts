import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, withUser } from "@/lib/db";
import { handleCommand } from "@/agents/commands";
import { saveSettings } from "@/lib/settings";
import { drain, freshDb, newUser, runOf } from "./helpers";

beforeAll(freshDb);
afterAll(async () => {
  await closePool();
  fs.rmSync("./storage-test", { recursive: true, force: true });
});

describe("Urdu / Roman Urdu / name-addressed commands end to end", () => {
  it("creates a task from an Urdu reminder, keeping the Urdu title and replying in Urdu", async () => {
    const u = await newUser();
    const r = await handleCommand(u.id, "ساتھی، مجھے کل شام 5 بجے رپورٹ مکمل کرنے کی یاد دلانا");
    expect(r.lang).toBe("ur");
    expect(r.intent).toBe("task_create");
    expect(r.reply).toMatch(/[؀-ۿ]/);
    await drain();
    expect((await runOf(u.id, r.runId)).run.status).toBe("completed");
    const t = await withUser(u.id, (db) => db.one<{ title: string; due_at: string; remind_at: string }>("select title, due_at, remind_at from tasks where title like '%رپورٹ%'"));
    expect(t!.title).toBe("رپورٹ مکمل کرنا");
    expect(t!.remind_at).not.toBeNull();
  });

  it("answers 'what is your name' with the configured name, in Roman Urdu", async () => {
    const u = await newUser();
    await withUser(u.id, (db) => saveSettings(db, u.id, { assistant: { name: "Noor", urduName: "نور" } }));
    const r = await handleCommand(u.id, "Noor, tumhara naam kya hai");
    expect(r.intent).toBe("identity");
    expect(r.replyLang).toBe("roman");
    await drain();
    const s = await runOf(u.id, r.runId);
    expect(String(s.run.result?.markdown)).toContain("Mera naam Noor hai");
  });

  it("plans the day from Roman Urdu and records it under the user's words", async () => {
    const u = await newUser();
    const r = await handleCommand(u.id, "mera din plan karo");
    expect(r.intent).toBe("plan_day");
    expect(r.understoodAs).toBe("Plan my day");
    await drain();
    expect((await runOf(u.id, r.runId)).run.status).toBe("completed");
  });

  it("reply language can be forced in settings", async () => {
    const u = await newUser();
    await withUser(u.id, (db) => saveSettings(db, u.id, { assistant: { replyLanguage: "ur" } }));
    const r = await handleCommand(u.id, "Plan my day");
    expect(r.replyLang).toBe("ur");
    expect(r.reply).toMatch(/[؀-ۿ]/);
  });

  it("unknown Urdu without an AI model gets Urdu help instead of a guess", async () => {
    const u = await newUser();
    const r = await handleCommand(u.id, "آسمان نیلا کیوں ہوتا ہے");
    expect(r.intent).toBe("general");
    await drain();
    expect(String((await runOf(u.id, r.runId)).run.result?.markdown)).toContain("میرا دن پلان کرو");
  });
});
