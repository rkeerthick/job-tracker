import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { ChatMessageList } from "@/components/ChatPanel";

const render = (messages: Parameters<typeof ChatMessageList>[0]["messages"], status: string | null = null, streaming = false) =>
  renderToStaticMarkup(<ChatMessageList messages={messages} status={status} streaming={streaming} />);

describe("ChatMessageList", () => {
  it("renders model/user text as escaped text, never as HTML", () => {
    const html = render([
      { role: "user", content: "<img src=x onerror=alert(1)>" },
      { role: "assistant", content: '<script>alert("pwned")</script> **bold** <b onclick=x()>hi</b>' },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("**bold**"); // plain text: markdown is intentionally not rendered
  });

  it("shows the tool status as dim text BELOW the assistant bubble while waiting", () => {
    const html = render([{ role: "user", content: "q" }, { role: "assistant", content: "" }], "Searching your applications…", true);
    expect(html).toContain("Searching your applications…");
    expect(html).toMatch(/<\/div><p class="[^"]*text-muted[^"]*">Searching your applications…<\/p>/); // a sibling after the bubble, not inside it
  });

  it("shows a placeholder dot in the empty bubble while streaming", () => {
    expect(render([{ role: "user", content: "q" }, { role: "assistant", content: "" }], null, true)).toContain("…");
  });

  it("shows the status under a bubble that already has text (a tool runs mid-answer)", () => {
    const html = render([{ role: "user", content: "q" }, { role: "assistant", content: "Checking. " }], "Checking interviews…", true);
    expect(html).toContain("Checking. ");
    expect(html).toContain("Checking interviews…");
  });

  it("does not show the status once streaming has ended", () => {
    expect(render([{ role: "assistant", content: "done" }], "Searching your applications…", false)).not.toContain("Searching");
  });

  it("labels who said what for screen readers", () => {
    const html = render([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]);
    expect(html).toContain("You: ");
    expect(html).toContain("Assistant: ");
  });
});
