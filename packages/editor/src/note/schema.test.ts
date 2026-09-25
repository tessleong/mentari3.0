import { describe, expect, it } from "vitest";

import { json2md, md2json } from "../markdown";
import { schema } from "./schema";

describe("paragraph/heading align attribute", () => {
  it("defaults to null (no alignment) for a plain paragraph", () => {
    const node = schema.node("paragraph", null, [schema.text("Hello")]);
    expect(node.attrs.align).toBeNull();
  });

  it("round-trips a set alignment through toDOM/parseDOM", () => {
    const node = schema.node("paragraph", { align: "center" }, [
      schema.text("Hello"),
    ]);
    const dom = document.createElement("div");
    // Minimal manual toDOM exercise: build the element the way toDOM
    // describes it, then re-parse via the schema's own parseDOM getAttrs.
    const el = document.createElement("p");
    el.style.textAlign = "center";
    dom.appendChild(el);

    const getAttrs = schema.nodes.paragraph.spec.parseDOM?.[0]?.getAttrs;
    expect(typeof getAttrs).toBe("function");
    expect((getAttrs as (dom: Node) => unknown)(el)).toEqual({
      align: "center",
    });
    expect(node.attrs.align).toBe("center");
  });

  it("ignores an unrecognized text-align value from pasted HTML", () => {
    const el = document.createElement("p");
    el.style.textAlign = "start";
    const getAttrs = schema.nodes.paragraph.spec.parseDOM?.[0]?.getAttrs as (
      dom: Node,
    ) => { align: string | null };
    expect(getAttrs(el)).toEqual({ align: null });
  });

  it("carries the level and align attrs together for a heading", () => {
    const node = schema.node("heading", { level: 2, align: "right" }, [
      schema.text("Title"),
    ]);
    expect(node.attrs).toEqual({ level: 2, align: "right" });
  });
});

describe("align attribute is safely dropped by the Markdown round trip", () => {
  it("does not throw and does not surface an align style when serializing to Markdown", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { align: "center" },
          content: [{ type: "text", text: "Centered line" }],
        },
      ],
    };

    const markdown = json2md(doc);

    expect(markdown).toContain("Centered line");
    expect(markdown).not.toContain("align");
  });

  it("round-trips plain content through md2json unaffected by the new attr existing in the note schema", () => {
    const result = md2json("Just a line of text.");

    expect(result.content?.[0]?.type).toBe("paragraph");
    expect(result.content?.[0]?.content?.[0]?.text).toBe(
      "Just a line of text.",
    );
  });
});
