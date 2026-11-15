import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session module so no DB / cookies() is involved.
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { requireUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth/session";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

describe("requireUser", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a 401 response when there is no user", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);

    const { user, error } = await requireUser();

    expect(user).toBeNull();
    expect(error?.status).toBe(401);
    expect(await error?.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns the user and no error when logged in", async () => {
    const u = { id: 1, email: "a@x.com", createdAt: new Date() };
    mockedGetCurrentUser.mockResolvedValue(u);

    const { user, error } = await requireUser();

    expect(error).toBeNull();
    expect(user).toEqual(u);
  });
});
