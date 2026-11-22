import { test, expect } from "@playwright/test";
import { applicationsOf, countUsersByEmail } from "./db";

// One user per run: the timestamp keeps emails unique across runs.
const ndjson = (events: object[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

test("sign up, add an application, ask the chat", async ({ page }) => {
  const email = `e2e+${Date.now()}@example.com`;

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/applications/);
    await expect(page.getByRole("heading", { name: "My applications" })).toBeVisible();
  });

  await test.step("add an application: it appears in the Saved column", async () => {
    await page.getByLabel("Company", { exact: true }).fill("Acme");
    await page.getByLabel("Role", { exact: true }).fill("Frontend Developer");
    // datetime-local has no zone: the browser (pinned to India time in playwright.config.ts) must convert to UTC.
    await page.getByLabel(/^Interview/).fill("2026-11-24T15:00");
    await page.getByRole("button", { name: "Add application" }).click();

    const saved = page.getByRole("region", { name: "saved" }); // each board column is a named region
    await expect(saved.getByText("Acme", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Company", { exact: true })).toHaveValue(""); // the form was cleared
  });

  await test.step("edit: the interview shows in IST, the form pre-fills in local time, changes save, a blank clears", async () => {
    const saved = page.getByRole("region", { name: "saved" });
    await expect(saved.getByText("Interview: Tue, 24 Nov, 3:00 pm")).toBeVisible();

    await saved.getByRole("button", { name: "Edit Acme" }).click();
    const form = page.getByRole("form", { name: "Edit Acme" });
    await expect(form.getByLabel(/^Interview/)).toHaveValue("2026-11-24T15:00"); // UTC 09:30 shown as local 15:00, not 09:30
    // Layout regression: every field must stay inside the card (the grid once sized to the inputs' default width and overflowed).
    const formBox = (await form.boundingBox())!;
    for (const input of await form.locator("input").all()) {
      const box = (await input.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(formBox.x + formBox.width + 1);
    }
    await form.getByLabel("Location").fill("Chennai");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
    await expect(saved.getByText("Chennai")).toBeVisible();
    await expect(saved.getByText("Interview: Tue, 24 Nov, 3:00 pm")).toBeVisible(); // untouched field survived

    await saved.getByRole("button", { name: "Edit Acme" }).click();
    await page.getByRole("form", { name: "Edit Acme" }).getByLabel(/^Interview/).fill(""); // blank -> null
    await page.getByRole("form", { name: "Edit Acme" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("form", { name: "Edit Acme" })).toBeHidden();
    await expect(saved.getByText(/^Interview:/)).toHaveCount(0);
  });

  await test.step("ask the chat (the model is mocked at the network)", async () => {
    const requests: { messages: { role: string; content: string }[] }[] = [];
    let call = 0;
    await page.route("**/api/chat", (route) => {
      requests.push(route.request().postDataJSON());
      const first = call++ === 0;
      return route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson(
          first
            ? [
                { type: "tool_start", tool: "upcoming_interviews" },
                { type: "tool_result", tool: "upcoming_interviews", count: 1 },
                { type: "token", text: "You have 1 interview: " },
                { type: "token", text: "Acme on Monday." },
                { type: "done" },
              ]
            : [{ type: "token", text: "That is Acme." }, { type: "done" }],
        ),
      });
    });

    const log = page.getByRole("log");
    await page.getByLabel("Your question").fill("Which interviews do I have next week?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(log).toContainText("You have 1 interview: Acme on Monday.");
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible(); // streaming ended

    // Second question: the request must carry the history (question, answer, new question).
    await page.getByLabel("Your question").fill("Which company was that?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(log).toContainText("That is Acme.");

    expect(requests).toHaveLength(2);
    expect(requests[0].messages).toEqual([{ role: "user", content: "Which interviews do I have next week?" }]);
    expect(requests[1].messages).toEqual([
      { role: "user", content: "Which interviews do I have next week?" },
      { role: "assistant", content: "You have 1 interview: Acme on Monday." },
      { role: "user", content: "Which company was that?" },
    ]);
  });

  await test.step("the app really wrote to the e2e database", async () => {
    expect(await countUsersByEmail(email)).toBe(1);
    expect(await applicationsOf(email)).toEqual([{ company: "Acme", role: "Frontend Developer", status: "saved", location: "Chennai", interviewAtUtc: null }]);
  });
});
