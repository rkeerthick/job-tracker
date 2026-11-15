import { describe, expect, it } from "vitest";
import { STATUSES } from "@/lib/statuses";

describe("STATUSES", () => {
  it("has the 5 pipeline statuses in board order", () => {
    // Order matters: the board renders its columns in this order.
    expect([...STATUSES]).toEqual(["saved", "applied", "interview", "offer", "rejected"]);
  });
});
