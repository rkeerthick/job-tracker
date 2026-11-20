import { describe, expect, it } from "vitest";
import { joinSkills, splitSkills } from "@/lib/skills";

describe("splitSkills", () => {
  it("splits on commas and trims", () => {
    expect(splitSkills("React, TypeScript ,Next.js")).toEqual(["React", "TypeScript", "Next.js"]);
  });

  it("drops empty and whitespace-only entries", () => {
    expect(splitSkills("React,, ,TS,")).toEqual(["React", "TS"]);
    expect(splitSkills("")).toEqual([]);
    expect(splitSkills("  ,  ")).toEqual([]);
  });

  it("round-trips with joinSkills", () => {
    expect(splitSkills(joinSkills(["React", "Node.js"]))).toEqual(["React", "Node.js"]);
  });
});
