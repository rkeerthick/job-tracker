import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("drizzle-orm", async (orig) => {
  const m = await orig<typeof import("drizzle-orm")>();
  return { ...m, eq: vi.fn(m.eq) }; // same behaviour, but we can see what each query is compared with
});
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/db", () => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { db: { update: vi.fn(() => ({ set })), __returning: returning, __set: set, __where: where } };
});

import { PATCH } from "@/app/api/applications/[id]/route";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { applications } from "@/db/schema";

const mock = db as unknown as {
  update: ReturnType<typeof vi.fn>;
  __returning: ReturnType<typeof vi.fn>;
  __set: ReturnType<typeof vi.fn>;
  __where: ReturnType<typeof vi.fn>;
};

const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://localhost/api/applications/${id}`, { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: 7, email: "a@x.com", createdAt: new Date() }, error: null });
  mock.__returning.mockResolvedValue([{ id: 5, company: "Acme", status: "offer" }]);
});

describe("PATCH /api/applications/[id]", () => {
  it("401 when logged out, and never touches the database", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await patch("5", { status: "offer" })).status).toBe(401);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("400 for a bad id", async () => {
    for (const id of ["abc", "-1", "1.5", "0"]) expect((await patch(id, { status: "offer" })).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("400 with field errors for an invalid body; no database call", async () => {
    const res = await patch("5", { link: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors).toHaveProperty("link");
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("400 for {}, unknown keys (userId, id) and non-JSON", async () => {
    for (const body of [{}, { status: "offer", userId: 1 }, { id: 9, status: "offer" }, "not json"]) {
      expect((await patch("5", body)).status).toBe(400);
    }
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("converts interviewAt to a Date and keeps null as null (clear)", async () => {
    await patch("5", { interviewAt: "2026-12-01T10:00:00+05:30", link: null });
    const set = mock.__set.mock.calls[0][0];
    expect(set.interviewAt).toBeInstanceOf(Date);
    expect(set.interviewAt.toISOString()).toBe("2026-12-01T04:30:00.000Z");
    expect(set.link).toBeNull();
  });

  it("rejects a typo year (0002) with 400", async () => {
    expect((await patch("5", { interviewAt: "0002-12-01T10:00:00Z" })).status).toBe(400);
  });

  it("only sends the keys that were provided (absent = untouched)", async () => {
    await patch("5", { status: "offer" });
    expect(Object.keys(mock.__set.mock.calls[0][0])).toEqual(["status"]);
  });

  it("scopes the update to id AND the session's user (never a body value)", async () => {
    await patch("5", { status: "offer" });
    expect(mock.__where).toHaveBeenCalledTimes(1);
    const compared = vi.mocked(eq).mock.calls.map(([col, val]) => [col, val]);
    expect(compared).toContainEqual([applications.id, 5]);
    expect(compared).toContainEqual([applications.userId, 7]);
  });

  it("404 when no row matched (missing or someone else's), and 200 with the row otherwise", async () => {
    mock.__returning.mockResolvedValueOnce([]);
    expect((await patch("5", { status: "offer" })).status).toBe(404);
    const ok = await patch("5", { status: "offer" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: 5 });
  });

  it("500 is generic when the database fails", async () => {
    mock.__returning.mockRejectedValueOnce(new Error("connection to ep-secret.neon.tech refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await patch("5", { status: "offer" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/neon|ep-secret|refused/);
  });
});
