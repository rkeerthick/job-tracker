import { describe, expect, it } from "vitest";
import { STATUSES } from "@/lib/statuses";

describe("STATUSES", () => {
  it("has the 5 pipeline statuses in board order", () => {
    // Order matters: the board renders its columns in this order.
    expect([...STATUSES]).toEqual(["saved", "applied", "interview", "offer", "rejected"]);
  });
});

// DELIBERATELY FAILING: proves CI turns the PR red and blocks the merge. Reverted in the next commit.
it("deliberately failing test (CI proof)", () => {
  expect(STATUSES.length).toBe(6);
});
