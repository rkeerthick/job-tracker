import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The card contains client components that call useRouter(); there is no router in a unit test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { ApplicationCard } from "@/components/ApplicationCard";
import type { Application } from "@/lib/applications";

const base: Application = {
  id: 1, userId: 1, company: "Acme", role: "Dev", link: null, status: "saved",
  location: null, salaryText: null, skills: null, interviewAt: null, appliedAt: null,
  createdAt: new Date("2026-11-14T10:00:00Z"),
};
const render = (over: Partial<Application>) => renderToStaticMarkup(<ApplicationCard app={{ ...base, ...over }} />);

describe("ApplicationCard", () => {
  it("shows location and salary as muted text, joined with a dot", () => {
    const html = render({ location: "Bengaluru", salaryText: "12-18 LPA" });
    expect(html).toContain("Bengaluru · 12-18 LPA");
  });

  it("shows only what exists, and nothing when both are empty", () => {
    expect(render({ location: "Chennai" })).toContain("Chennai");
    expect(render({ location: "Chennai" })).not.toContain("·");
    expect(render({})).not.toContain("·");
  });

  it("escapes HTML in model-produced text: a <script> payload renders as text, never as a tag", () => {
    const html = render({
      company: "<script>alert(1)</script>",
      role: "<img src=x onerror=alert(1)>",
      location: "<script>alert('loc')</script>",
      salaryText: "<b onclick=alert(1)>pay</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders an http(s) link as a new-tab link with rel=noopener noreferrer", () => {
    const html = render({ link: "https://acme.com/jobs/1" });
    expect(html).toContain('href="https://acme.com/jobs/1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("never renders a javascript: link, even if bad data got into the database", () => {
    expect(render({ link: "javascript:alert(1)" })).not.toContain("javascript:");
    expect(render({ link: "data:text/html,<script>alert(1)</script>" })).not.toContain("href=");
  });
});
