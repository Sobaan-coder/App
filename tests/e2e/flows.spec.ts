import { expect, test, type Page } from "@playwright/test";

const email = `e2e${Date.now()}@test.local`;
const password = "E2e-password-123";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("textbox", { name: "What do you want me to do?" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("sign up (first user → admin) and see the first-run welcome", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("WELCOME TO YOUR AI COMMAND CENTER")).toBeVisible();
  await expect(page.getByText("What do you want to automate?")).toBeVisible();
  await page.getByText("I'll explore myself").click();
  await expect(page.getByText("AI ONLINE").first()).toBeVisible();
});

test("natural-language command → plan → executed result", async ({ page }) => {
  await login(page);
  const box = page.getByRole("textbox", { name: "What do you want me to do?" });
  await box.fill("Remind me tomorrow to finish the internship report");
  await box.press("Enter");
  await expect(page.getByText(/Got it\. I'll/)).toBeVisible();
  await expect(page.getByText("Task created:")).toBeVisible();
  await box.fill("Prepare tomorrow's schedule");
  await box.press("Enter");
  await expect(page.getByRole("heading", { name: /Plan for/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Finish the internship report" })).toBeVisible();
});

test("create project and task", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator("input[name=name]").fill("Thesis");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("PROJECT: THESIS")).toBeVisible();
  await page.goto("/tasks");
  await page.getByPlaceholder("Add a task in plain English…").fill("Write chapter 2 by Friday high priority");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: /Write chapter 2/ })).toBeVisible();
});

test("create automation from natural language, pause and resume it, run it", async ({ page }) => {
  await login(page);
  await page.goto("/automations");
  await page.getByPlaceholder(/Every Monday morning/).fill("Every Monday at 8am, check my unfinished tasks, identify the important ones, create a schedule for the week, and notify me.");
  await page.getByRole("button", { name: "Design it" }).click();
  await expect(page.getByText("Trigger: Every Monday at 08:00")).toBeVisible();
  await page.getByRole("button", { name: "CREATE" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]+$/);
  await expect(page.getByText("TRIGGER")).toBeVisible();
  await page.getByRole("switch").first().click(); // pause
  await expect(page.getByText("Paused").first()).toBeVisible();
  await page.getByRole("switch").first().click(); // resume
  await expect(page.getByText("Active").first()).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
});

test("content: generate post, quality checks, approval required, approve & publish → manual packages", async ({ page }) => {
  await login(page);
  const box = page.getByRole("textbox", { name: "What do you want me to do?" });
  await box.fill("Create today's Merchants post about the Crown Crust Pizza and publish it to Instagram and Facebook");
  await box.press("Enter");
  await expect(page.getByText("APPROVAL REQUIRED").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Open the post/ }).click();
  await expect(page.getByText("CONTENT READY")).toBeVisible();
  await expect(page.getByText(/Quality control/)).toBeVisible();
  await expect(page.getByText("Price check:")).toBeVisible();
  await page.getByRole("button", { name: "APPROVE & PUBLISH" }).click();
  await expect(page.getByText("MANUAL REQUIRED").first()).toBeVisible({ timeout: 45_000 });
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download content package/i }).first().click();
  expect((await dl).suggestedFilename()).toMatch(/\.zip$/);
});

test("approval center: reject a pending action", async ({ page }) => {
  await login(page);
  const box = page.getByRole("textbox", { name: "What do you want me to do?" });
  await box.fill("Create a post for Zinger Burger and publish it to Facebook");
  await box.press("Enter");
  await expect(page.getByText("APPROVAL REQUIRED").first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await expect(page.getByText(/Rejected — nothing was executed/)).toBeVisible();
});

test("upload a document and process it", async ({ page }) => {
  await login(page);
  await page.goto("/files");
  await page.locator("input[type=file]").setInputFiles({
    name: "meeting-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Project kickoff meeting notes. The team agreed to launch the new menu in November. We must prepare the price list by Friday. Sarah should review the supplier contract before the deadline. The marketing budget was approved for the first quarter. Next meeting is scheduled for Monday.",
    ),
  });
  await expect(page.getByText("meeting-notes.txt")).toBeVisible();
  await page.getByRole("button", { name: "Summarise" }).first().click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.getByText("Action items").first()).toBeVisible({ timeout: 45_000 });
});
