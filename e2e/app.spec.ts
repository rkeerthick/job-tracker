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
    await page.getByRole("button", { name: "Add application" }).click();

    const saved = page.getByRole("region", { name: "saved" }); // each board column is a named region
    await expect(saved.getByText("Acme", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Company", { exact: true })).toHaveValue(""); // the form was cleared
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
    expect(await applicationsOf(email)).toEqual([{ company: "Acme", role: "Frontend Developer", status: "saved" }]);
  });
});
