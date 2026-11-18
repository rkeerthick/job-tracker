import { describe, expect, it, vi } from "vitest";
import { extractWithRetry, toStrictJsonSchema, type Message } from "@/lib/extract-job";

const good = { company: "Acme", role: "Frontend Dev", location: null, salaryText: null, skills: ["React"] };
const bad = { ...good, salaryText: 1800000 }; // wrong type: must be a string or null

describe("extractWithRetry", () => {
  it("returns data after one call when the first output is valid", async () => {
    const call = vi.fn().mockResolvedValue(JSON.stringify(good));
    const r = await extractWithRetry("post", call);
    expect(r).toEqual({ ok: true, data: good, attempts: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("accepts JSON wrapped in ```json fences", async () => {
    const call = vi.fn().mockResolvedValue("```json\n" + JSON.stringify(good) + "\n```");
    expect((await extractWithRetry("post", call)).ok).toBe(true);
  });

  it("retries once, showing the model its validation error, and succeeds", async () => {
    const call = vi.fn<(m: Message[]) => Promise<string>>()
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(good));
    const r = await extractWithRetry("post", call);

    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const retryMessages = call.mock.calls[1][0];
    expect(retryMessages.at(-1)?.content).toContain("salaryText"); // the error names the bad field
    expect(retryMessages.at(-2)).toEqual({ role: "assistant", content: JSON.stringify(bad) });
  });

  it("gives up after ONE retry and returns the error plus the raw output", async () => {
    const call = vi.fn().mockResolvedValue("not json at all");
    const r = await extractWithRetry("post", call);
    expect(call).toHaveBeenCalledTimes(2); // never a third call
    expect(r).toMatchObject({ ok: false, attempts: 2, rawOutput: "not json at all" });
  });
});

describe("toStrictJsonSchema", () => {
  const schema = toStrictJsonSchema() as {
    type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown>;
  };

  it("lists every property as required and forbids extra keys (Groq strict mode rules)", () => {
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.keys(schema.properties).sort()).toEqual(["company", "location", "role", "salaryText", "skills"]);
  });

  it("drops keywords strict mode may reject", () => {
    expect(JSON.stringify(schema)).not.toMatch(/\$schema|minLength|"format"/);
  });
});
