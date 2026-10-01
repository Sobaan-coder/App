# Automations

An automation = **trigger** + ordered **steps**. Each run is visible in the Work Queue with live progress,
and every step is logged.

## Create one

1. **Plain English** (command box or Automations page):
   *"Every Monday morning, check my unfinished tasks, identify the important ones, create a schedule for the week, and notify me."*
   → the assistant shows the trigger and steps and asks **"Create this automation?" [CREATE]**. Nothing is created without your click.
2. **Templates** (Automations → Ready-made templates).
3. **Visual builder** (Automations → Build visually): drag steps to reorder; add Action, Condition, Delay,
   Approval or Notify steps.
4. **Automation discovery:** after you give a similar command 3 times in 30 days, you'll be offered
   *"You perform this task frequently. Would you like me to create an automation?" [Create Automation] [Not Now]*.

## Triggers

| Trigger | Example |
|---|---|
| Schedule (cron, your timezone) | every day 08:00 `0 8 * * *`, every Monday `0 8 * * 1`, every 2 hours `0 */2 * * *`, a specific date `30 9 15 11 *` |
| File added | when a PDF/DOCX is uploaded (`{{trigger.fileId}}`, `{{trigger.fileName}}`) |
| Webhook | `POST /api/hooks/<secret>`; JSON body is `{{trigger.body}}` |
| Event | new product added / new deal (special offer) added (`{{trigger.productName}}`, `{{trigger.offer}}`) |
| Manual | "Run now" |

Natural-language schedules understood: *every day / morning / evening / weekday / weekend / Monday… /
week / month / month on the 15th / every N hours / every N minutes / at 8 PM / at 17:30 / noon*.

## Steps

| Kind | Fields |
|---|---|
| **Action** | `tool`, `input` (JSON with templates), optional `forEach` loop, `retries`, `onError: stop|continue`, `when` condition, `fallback` tool |
| **Condition** | `left op right` (`exists, not_exists, truthy, falsy, eq, neq, gt, gte, lt, lte, contains`), `onFalse: stop|skip_next` |
| **Delay** | `delayMinutes` — the run waits durably (survives restarts) |
| **Approval** | pauses until you approve in the Approval Center |

### Templates in inputs

`{{steps.<stepId>.<field>}}` (e.g. `{{steps.tasks.tasks}}`, `{{steps.find.fileIds[0]}}`), `{{trigger.x}}`,
`{{item}}` inside loops, `{{now}}`. A value that is exactly one placeholder keeps its type (arrays stay arrays).

## Reliability

- Transient failures retry with exponential backoff (Settings → Automation → retries; per-step override).
- Each step has a timeout; a tool that fails repeatedly trips a 2-minute circuit breaker.
- Failed runs explain the failed step and reason; you get a notification. Say **"Why did this automation fail?"** or **"Retry it."**
- Jobs stuck by a crash are re-queued automatically; schedules are claimed atomically (never run twice).
- **Pause all** (Automations page, Settings, or "Pause all automations") stops schedules and triggers.

## Built-in templates

Daily Planner · End-of-Day Review · Weekly Report · Document Processor · Research Agent · File Organizer ·
Website Monitor · Daily Content · Weekly Content Plan · Deal Promotion · Product Launch.

## Examples

```
Every morning at 8 AM create my work plan.
Every Friday prepare weekly report.
Whenever I upload a PDF, summarize it and create tasks from the action items.
Monitor https://example.com/pricing every 2 hours.
Post every day at 8 PM.
Every Sunday create 7 days of content.
```
