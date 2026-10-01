import fs from "node:fs";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, sql, userDb, withUser } from "@/lib/db";
import { handleCommand } from "@/agents/commands";
import { createAutomation, fireEvent, runDueSchedules, startRun } from "@/automations/service";
import { decideApproval } from "@/services/approvals";
import { resumeAfterDecision } from "@/workflows/engine";
import { buildContentPackage } from "@/services/content/posts";
import { saveFile } from "@/services/storage";
import { stepSchema } from "@/workflows/types";
import { drain, freshDb, newUser, runOf } from "./helpers";

beforeAll(freshDb);
afterAll(async () => {
  await closePool();
  fs.rmSync("./storage-test", { recursive: true, force: true });
});

const plan = (steps: unknown[]) => ({ goal: "test", intent: "test", requiresApproval: false, steps: steps.map((s) => stepSchema.parse(s)) });

describe("command → plan → execute → verify → result", () => {
  it("runs a multi-step plan and records activity, history and memory", async () => {
    const u = await newUser();
    await handleCommand(u.id, "Remind me tomorrow to finish the report");
    const r = await handleCommand(u.id, "Prepare tomorrow's schedule");
    expect(r.steps.map((s) => s.tool)).toEqual(["task_list", "task_prioritize", "schedule_generate", "document_create"]);
    await drain();
    const { run, steps } = await runOf(u.id, r.runId);
    expect(run.status).toBe("completed");
    expect(steps.every((s) => s.status === "completed")).toBe(true);
    expect(String(run.result?.markdown)).toContain("Finish the report");
    expect((run.result?.files as unknown[]).length).toBe(1);
    const log = await withUser(u.id, (db) => db.query("select message from activity_logs where run_id = $1", [r.runId]));
    expect(log.length).toBeGreaterThan(3);
    await handleCommand(u.id, "Remember that I prefer short bullet points");
    await drain();
    const mem = await withUser(u.id, (db) => db.query<{ category: string }>("select category from memories"));
    expect(mem[0].category).toBe("preference");
  });

  it("suggests an automation after a task is repeated (never creates it automatically)", async () => {
    const u = await newUser();
    let last;
    for (let i = 0; i < 3; i++) last = await handleCommand(u.id, "What should I work on next?");
    expect(last!.suggestion?.occurrences).toBe(3);
    const autos = await withUser(u.id, (db) => db.query("select id from automations"));
    expect(autos).toHaveLength(0);
  });
});

describe("approvals & human-in-the-loop", () => {
  it("MEDIUM risk pauses for approval; approval runs exactly the approved input", async () => {
    const u = await newUser();
    const runId = await startRun({ userId: u.id, title: "archive", source: "command", plan: plan([{ id: "find", action: "find", tool: "file_search", input: {} }, { id: "arch", action: "archive", tool: "file_archive", input: { fileIds: "{{steps.find.fileIds}}" } }]) });
    await withUser(u.id, (db) => saveFile(db, u.id, { name: "old.txt", folder: "uploads", data: "x" }));
    await drain();
    let s = await runOf(u.id, runId);
    expect(s.run.status).toBe("approval_required");
    expect(s.approvals[0].status).toBe("pending");
    const out = await withUser(u.id, (db) => decideApproval(db, u.id, s.approvals[0].id, { decision: "approve" }));
    await resumeAfterDecision(out.runId!, u.id);
    await drain();
    s = await runOf(u.id, runId);
    expect(s.run.status).toBe("completed");
    const f = await withUser(u.id, (db) => db.one<{ folder: string; archived: boolean }>("select folder, archived from files"));
    expect(f).toEqual({ folder: "archive", archived: true });
  });

  it("rejection stops the run and nothing is executed", async () => {
    const u = await newUser();
    const runId = await startRun({ userId: u.id, title: "mail", source: "command", plan: plan([{ id: "send", action: "send", tool: "email_send", input: { to: "a@b.co", subject: "Hi", body: "x" } }]) });
    await drain();
    const s = await runOf(u.id, runId);
    await withUser(u.id, (db) => decideApproval(db, u.id, s.approvals[0].id, { decision: "reject" }));
    await resumeAfterDecision(runId, u.id);
    await drain();
    const after = await runOf(u.id, runId);
    expect(after.run.status).toBe("cancelled");
    expect(after.steps[0].status).toBe("cancelled");
  });

  it("HIGH risk requires typing CONFIRM", async () => {
    const u = await newUser();
    const runId = await startRun({ userId: u.id, title: "shell", source: "command", plan: plan([{ id: "sh", action: "shell", tool: "shell_command", input: { command: "ls" } }]) });
    await drain();
    const s = await runOf(u.id, runId);
    expect(s.approvals[0].requires_confirmation).toBe(true);
    await expect(withUser(u.id, (db) => decideApproval(db, u.id, s.approvals[0].id, { decision: "approve" }))).rejects.toThrow(/CONFIRM/);
    await withUser(u.id, (db) => decideApproval(db, u.id, s.approvals[0].id, { decision: "approve", confirmText: "CONFIRM" }));
    await resumeAfterDecision(runId, u.id);
    await drain();
    const after = await runOf(u.id, runId);
    // shell tool is disabled by default in .env → fails safely with an explanation
    expect(after.run.status).toBe("failed");
    expect(after.run.error).toMatch(/disabled/);
  });

  it("a disabled tool is refused", async () => {
    const u = await newUser();
    await withUser(u.id, (db) => db.query("insert into tool_permissions(user_id, tool_name, mode) values ($1,'task_list','disabled')", [u.id]));
    const runId = await startRun({ userId: u.id, title: "x", source: "command", plan: plan([{ id: "a", action: "list", tool: "task_list", input: {} }]) });
    await drain();
    expect((await runOf(u.id, runId)).run.error).toMatch(/disabled in your settings/);
  });
});

describe("error handling", () => {
  it("fails clearly with step + reason; onError=continue keeps going; conditions can stop early", async () => {
    const u = await newUser();
    const failing = await startRun({ userId: u.id, title: "bad", source: "command", plan: plan([{ id: "read", action: "read missing file", tool: "file_read", input: { fileId: "00000000-0000-0000-0000-000000000000" } }]) });
    const cont = await startRun({
      userId: u.id,
      title: "continue",
      source: "command",
      plan: plan([
        { id: "read", action: "read missing", tool: "file_read", input: { fileId: "00000000-0000-0000-0000-000000000000" }, onError: "continue" },
        { id: "gate", kind: "condition", action: "has tasks?", condition: { left: "{{steps.list.count}}", op: "gt", right: 0 } },
        { id: "list", action: "never runs", tool: "task_list", input: {} },
      ]),
    });
    await drain();
    const f = await runOf(u.id, failing);
    expect(f.run.status).toBe("failed");
    expect(f.run.error).toMatch(/read missing file.*File not found/);
    const c = await runOf(u.id, cont);
    expect(c.run.status).toBe("completed");
    expect(c.steps.map((s) => s.status)).toEqual(["failed", "completed", "skipped"]);
  });

  it("invalid tool input is caught before execution", async () => {
    const u = await newUser();
    const id = await startRun({ userId: u.id, title: "x", source: "command", plan: plan([{ id: "a", action: "bad", tool: "task_create", input: { estimatedMinutes: "lots" } }]) });
    await drain();
    expect((await runOf(u.id, id)).run.error).toMatch(/Invalid input/);
  });
});

describe("automations: schedules, events, pause", () => {
  it("runs a due scheduled automation exactly once and computes the next run", async () => {
    const u = await newUser();
    const a = await withUser(u.id, (db) =>
      createAutomation(db, u.id, { name: "daily", description: "", trigger: { type: "schedule", cron: "0 8 * * *" }, steps: [{ id: "t", action: "list", tool: "task_list", input: {} }] }),
    );
    expect(a.next_run_at).not.toBeNull();
    await sql.query("update automations set next_run_at = now() - interval '1 minute' where id = $1", [a.id]);
    const [started1, started2] = await Promise.all([runDueSchedules(), runDueSchedules()]);
    expect(started1 + started2).toBe(1); // atomic claim: no double runs
    await drain();
    const runs = await withUser(u.id, (db) => db.query<{ status: string }>("select status from automation_runs where automation_id = $1", [a.id]));
    expect(runs.map((r) => r.status)).toEqual(["completed"]);
    const next = await sql.one<{ next_run_at: string }>("select next_run_at from automations where id = $1", [a.id]);
    expect(new Date(next!.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("file-added triggers the document processor; pausing all stops triggers", async () => {
    const u = await newUser();
    const { templateToDraft } = await import("@/workflows/templates");
    await withUser(u.id, (db) => createAutomation(db, u.id, templateToDraft("document_processor")!));
    const file = await withUser(u.id, (db) =>
      saveFile(db, u.id, { name: "notes.txt", folder: "uploads", data: "Meeting notes. We must submit the grant application by Friday. The budget was approved for next quarter. Ali should prepare slides." }),
    );
    const runIds = await fireEvent(u.id, "file_added", { fileId: file.id, fileName: file.name, folder: "uploads" });
    expect(runIds).toHaveLength(1);
    await drain();
    const r = await runOf(u.id, runIds[0]);
    expect(r.run.status).toBe("completed");
    const doc = await withUser(u.id, (db) => db.one<{ summary: string }>("select summary from documents where file_id = $1", [file.id]));
    expect(doc!.summary.length).toBeGreaterThan(10);
    await withUser(u.id, (db) => db.query("insert into settings(user_id, key, value) values ($1,'automation','{\"paused\":true}')", [u.id]));
    expect(await fireEvent(u.id, "file_added", { fileId: file.id, fileName: "x.pdf" })).toHaveLength(0);
  });
});

describe("content pipeline ($0, honest fallbacks)", () => {
  it("generates a post with image + captions, requires approval to publish, then prepares manual packages", async () => {
    const u = await newUser();
    await withUser(u.id, (db) => db.query("update products set price = 1499 where name = 'Merchants Crown Crust Pizza'"));
    const r = await handleCommand(u.id, "Create today's Merchants post about the Crown Crust Pizza and publish it to Instagram, Facebook, TikTok and YouTube.");
    await drain();
    let s = await runOf(u.id, r.runId);
    expect(s.run.status).toBe("approval_required");
    const postId = String(s.run.result?.postId);
    const post = await withUser(u.id, (db) => db.one<{ quality_report: { passed: boolean }; platforms: string[] }>("select * from content_posts where id = $1", [postId]));
    expect(post!.quality_report.passed).toBe(true);
    expect(post!.platforms).toEqual(["instagram", "facebook", "tiktok", "youtube"]);
    const caps = await withUser(u.id, (db) => db.query<{ platform: string; caption: string }>("select platform, caption from captions where post_id = $1", [postId]));
    expect(new Set(caps.map((c) => c.caption)).size).toBe(4);
    expect(caps.find((c) => c.platform === "instagram")!.caption).toContain("1,499");
    // nothing published before approval
    expect(await withUser(u.id, (db) => db.query("select * from publishing_jobs where post_id = $1", [postId]))).toHaveLength(0);
    await withUser(u.id, (db) => decideApproval(db, u.id, s.approvals[0].id, { decision: "approve" }));
    await resumeAfterDecision(r.runId, u.id);
    await drain();
    s = await runOf(u.id, r.runId);
    expect(s.run.status).toBe("completed");
    const jobs = await withUser(u.id, (db) => db.query<{ platform: string; status: string }>("select platform, status from publishing_jobs where post_id = $1", [postId]));
    expect(jobs.every((j) => j.status === "manual_required")).toBe(true); // no accounts connected → honest manual fallback
    const pkg = await buildContentPackage(userDb(u.id), postId);
    const zip = await JSZip.loadAsync(pkg.data);
    const names = Object.keys(zip.files).map((n) => n.split("/").pop());
    for (const f of ["image.png", "instagram.txt", "facebook.txt", "tiktok.txt", "youtube.txt", "metadata.json", "image-prompt.txt"]) expect(names).toContain(f);
  });

  it("never promotes an unavailable product (quality gate stops publishing)", async () => {
    const u = await newUser();
    await withUser(u.id, (db) => db.query("update products set available = false where name = 'Zinger Burger'"));
    const r = await handleCommand(u.id, "Create a post for Zinger Burger and publish it to Facebook");
    await drain();
    const s = await runOf(u.id, r.runId);
    expect(s.run.status).toBe("completed");
    expect(s.steps.find((x) => x.step_key === "publish")?.status).toBe("skipped");
    expect(s.approvals).toHaveLength(0);
  });
});
