import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationFields, emptyApplicationValues } from "@/components/ApplicationFields";

const render = (props: Partial<Parameters<typeof ApplicationFields>[0]> = {}) =>
  renderToStaticMarkup(<ApplicationFields values={emptyApplicationValues} onChange={() => {}} {...props} />);

/** The <input> that a <label> points at (they are tied by the generated id). Plain-text label, no regex. */
function inputFor(html: string, label: string): string {
  const labelTag = (html.match(/<label[^>]*>[^<]*<\/label>/g) ?? []).find((l) => l.endsWith(`>${label}</label>`));
  expect(labelTag, `label "${label}" not found`).toBeTruthy();
  const id = /for="([^"]+)"/.exec(labelTag!)![1];
  const input = (html.match(/<input[^>]*>/g) ?? []).find((i) => i.includes(`id="${id}"`));
  expect(input, `input for "${label}" not found`).toBeTruthy();
  return input!;
}

describe("ApplicationFields", () => {
  it("renders every field, labelled, with the right input type", () => {
    const html = render();
    expect(inputFor(html, "Company")).toMatch(/required/);
    expect(inputFor(html, "Role")).toMatch(/required/);
    expect(inputFor(html, "Link (optional)")).toMatch(/type="url"/);
    expect(inputFor(html, "Location")).not.toMatch(/type="(url|datetime-local)"/);
    expect(inputFor(html, "Salary")).not.toMatch(/type="(url|datetime-local)"/);
    expect(inputFor(html, "Skills (comma separated)")).not.toMatch(/type="(url|datetime-local)"/);
    expect(inputFor(html, "Interview (optional)")).toMatch(/type="datetime-local"/);
  });

  it("shows the values it is given (so Edit can pre-fill)", () => {
    const html = render({ values: { ...emptyApplicationValues, company: "Acme", interviewAt: "2026-11-24T15:00" } });
    expect(inputFor(html, "Company")).toMatch(/value="Acme"/);
    expect(inputFor(html, "Interview (optional)")).toMatch(/value="2026-11-24T15:00"/);
  });

  it("disables every field together", () => {
    const html = render({ disabled: true });
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(7);
    for (const i of inputs) expect(i).toMatch(/disabled/);
  });
});
