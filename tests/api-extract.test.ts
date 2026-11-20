import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/groq", () => ({ callGroq: vi.fn() }));

import { POST } from "@/app/api/extract/route";
import { requireUser } from "@/lib/auth";
import { callGroq } from "@/lib/groq";

const mockedAuth = vi.mocked(requireUser);
const mockedGroq = vi.mocked(callGroq);

const SECRET_POST = "Senior Frontend Engineer at SecretCorp, Bengaluru. We need React and TypeScript experts.";
const good = { company: "SecretCorp", role: "Senior Frontend Engineer", location: "Bengaluru", salaryText: null, skills: ["React", "TypeScript"] };

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/extract", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

let logged: string[];
beforeEach(() => {
  vi.resetAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: 7, email: "a@x.com", createdAt: new Date() }, error: null });
  logged = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((line) => { logged.push(String(line)); });
  }
});

describe("POST /api/extract", () => {
  it("401 for logged-out callers, and never calls the model", async () => {
    mockedAuth.mockResolvedValue({ user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await post({ text: SECRET_POST });
    expect(res.status).toBe(401);
    expect(mockedGroq).not.toHaveBeenCalled();
  });

  it("400 for missing, too short, too long, or non-JSON bodies, without calling the model", async () => {
    for (const body of [{}, { text: "too short" }, { text: "   " + "a".repeat(5) + "   " }, { text: "a".repeat(20001) }, { text: "a".repeat(25000) }, "not json"]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mockedGroq).not.toHaveBeenCalled();
  });

  it("200 { data } when the model returns valid output", async () => {
    mockedGroq.mockResolvedValue(JSON.stringify(good));
    const res = await post({ text: SECRET_POST });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: good });
  });

  it("422 when the model finds neither company nor role (text isn't a job posting)", async () => {
    mockedGroq.mockResolvedValue(JSON.stringify({ company: null, role: null, location: null, salaryText: null, skills: [] }));
    const res = await post({ text: "lorem ipsum dolor sit amet consectetur adipiscing elit" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Couldn't read this posting. Fill the form manually." });
    expect(mockedGroq).toHaveBeenCalledTimes(1); // valid JSON, so no pointless retry
  });

  it("200 with partial data when only one of company/role is found", async () => {
    const partial = { company: null, role: "Backend Developer", location: null, salaryText: null, skills: [] };
    mockedGroq.mockResolvedValue(JSON.stringify(partial));
    const res = await post({ text: SECRET_POST });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: partial });
  });

  it("422 with a generic message when output is invalid twice, and never exposes the raw output", async () => {
    mockedGroq.mockResolvedValue("garbage that mentions SecretCorp");
    const res = await post({ text: SECRET_POST });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Couldn't read this posting. Fill the form manually." });
    expect(mockedGroq).toHaveBeenCalledTimes(2); // first try + exactly one retry
  });

  it("503 with a generic message when the provider call throws, leaking no internals", async () => {
    mockedGroq.mockRejectedValue(new Error("Groq API error 429 key=gsk_SUPERSECRET"));
    const res = await post({ text: SECRET_POST });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "AI is busy, try again in a minute." });
    expect(text).not.toMatch(/429|gsk_|SUPERSECRET|Groq/);
  });

  it("never logs the posting text or the model's raw output", async () => {
    mockedGroq.mockResolvedValueOnce("garbage SecretCorp").mockResolvedValueOnce("more garbage SecretCorp");
    await post({ text: SECRET_POST });
    mockedGroq.mockRejectedValue(new Error("Groq API error 429"));
    await post({ text: SECRET_POST });
    mockedGroq.mockResolvedValue(JSON.stringify(good));
    await post({ text: SECRET_POST });

    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain("SecretCorp");
      expect(line).not.toContain("Frontend Engineer");
    }
    expect(logged.some((l) => l.includes('"textLength"'))).toBe(true); // length is fine to log
  });
});
