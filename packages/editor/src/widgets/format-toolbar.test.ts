import { EditorState, TextSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";

import { schema } from "../note/schema";
import {
  getActiveAlign,
  getActiveHeadingLevel,
  getClipBoundary,
  indentListItem,
  outdentListItem,
  selectionTouchesTitleHeading,
  setBlockAlign,
  setHeadingLevel,
  toggleList,
} from "./format-toolbar";

afterEach(() => {
  document.body.innerHTML = "";
});

function createState(from: number, to: number) {
  const doc = schema.node("doc", null, [
    schema.node("heading", { level: 1 }, [schema.text("Design sync")]),
    schema.node("paragraph", null, [schema.text("Follow up")]),
  ]);

  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to),
  });
}

describe("selectionTouchesTitleHeading", () => {
  it("returns true for selections inside the title heading", () => {
    expect(selectionTouchesTitleHeading(createState(1, 12))).toBe(true);
  });

  it("returns true for selections spanning the title heading", () => {
    expect(selectionTouchesTitleHeading(createState(6, 18))).toBe(true);
  });

  it("returns false for body selections", () => {
    expect(selectionTouchesTitleHeading(createState(14, 20))).toBe(false);
  });

  it("returns false when the first block is not a title heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 3),
    });

    expect(selectionTouchesTitleHeading(state)).toBe(false);
  });
});

describe("getClipBoundary", () => {
  it("returns the nearest overflow ancestor", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const inner = document.createElement("div");
    const target = document.createElement("div");
    inner.append(target);
    scroller.append(inner);
    document.body.append(scroller);

    expect(getClipBoundary(target)).toBe(scroller);
  });

  it("falls back to the element when there is no overflow ancestor", () => {
    const target = document.createElement("div");
    document.body.append(target);

    expect(getClipBoundary(target)).toBe(target);
  });
});

function stateFromDoc(
  doc: ReturnType<typeof schema.node>,
  pos = 1,
): EditorState {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

describe("getActiveHeadingLevel", () => {
  it("returns 0 for a paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    expect(getActiveHeadingLevel(stateFromDoc(doc))).toBe(0);
  });

  it("returns the level for a heading within the toolbar's exposed range", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 2 }, [schema.text("Title")]),
    ]);
    expect(getActiveHeadingLevel(stateFromDoc(doc))).toBe(2);
  });

  it("returns null for a heading level the toolbar doesn't expose", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 5 }, [schema.text("Title")]),
    ]);
    expect(getActiveHeadingLevel(stateFromDoc(doc))).toBeNull();
  });

  it("returns null outside a paragraph or heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("codeBlock", null, [schema.text("code")]),
    ]);
    expect(getActiveHeadingLevel(stateFromDoc(doc))).toBeNull();
  });
});

describe("setHeadingLevel", () => {
  it("converts a paragraph into a heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Title")]),
    ]);
    const state = stateFromDoc(doc);
    const result = state.applyTransaction(
      (() => {
        let tr = state.tr;
        setHeadingLevel(2)(state, (t) => {
          tr = t;
        });
        return tr;
      })(),
    ).state;

    expect(result.doc.firstChild?.type).toBe(schema.nodes.heading);
    expect(result.doc.firstChild?.attrs.level).toBe(2);
  });

  it("converts a heading back into a paragraph via level 0", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("Title")]),
    ]);
    const state = stateFromDoc(doc);
    let tr = state.tr;
    setHeadingLevel(0)(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.firstChild?.type).toBe(schema.nodes.paragraph);
  });
});

describe("getActiveAlign", () => {
  it("defaults to left when no align is set", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    expect(getActiveAlign(stateFromDoc(doc))).toBe("left");
  });

  it("returns the explicit align value", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", { align: "center" }, [schema.text("Body")]),
    ]);
    expect(getActiveAlign(stateFromDoc(doc))).toBe("center");
  });

  it("returns null outside a paragraph or heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("codeBlock", null, [schema.text("code")]),
    ]);
    expect(getActiveAlign(stateFromDoc(doc))).toBeNull();
  });
});

describe("setBlockAlign", () => {
  it("sets align on the block containing the selection", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = stateFromDoc(doc);
    let tr = state.tr;
    setBlockAlign("center")(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.firstChild?.attrs.align).toBe("center");
  });

  it("applies align to every alignable block the selection spans", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("One")]),
      schema.node("paragraph", null, [schema.text("Two")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, doc.content.size - 1),
    });
    let tr = state.tr;
    setBlockAlign("right")(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.child(0).attrs.align).toBe("right");
    expect(result.doc.child(1).attrs.align).toBe("right");
  });

  it("clears align back to the default when toggled off", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", { align: "center" }, [schema.text("Body")]),
    ]);
    const state = stateFromDoc(doc);
    let tr = state.tr;
    setBlockAlign(null)(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.firstChild?.attrs.align).toBeNull();
  });

  it("is a no-op outside a paragraph or heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("codeBlock", null, [schema.text("code")]),
    ]);
    const state = stateFromDoc(doc);
    const applied = setBlockAlign("center")(state, () => {
      throw new Error("dispatch should not be called");
    });

    expect(applied).toBe(false);
  });
});

describe("toggleList", () => {
  it("wraps a paragraph into a bullet list", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Item")]),
    ]);
    const state = stateFromDoc(doc);
    let tr = state.tr;
    toggleList(schema.nodes.bulletList)(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.firstChild?.type).toBe(schema.nodes.bulletList);
  });

  it("lifts back to a paragraph when already in that list type", () => {
    const doc = schema.node("doc", null, [
      schema.node("bulletList", null, [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Item")]),
        ]),
      ]),
    ]);
    const state = stateFromDoc(doc, 2);
    let tr = state.tr;
    toggleList(schema.nodes.bulletList)(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(result.doc.firstChild?.type).toBe(schema.nodes.paragraph);
  });
});

describe("outdentListItem", () => {
  it("lifts a nested list item out", () => {
    const doc = schema.node("doc", null, [
      schema.node("bulletList", null, [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Item")]),
        ]),
      ]),
    ]);
    const state = stateFromDoc(doc, 2);
    let tr = state.tr;
    const applied = outdentListItem(state, (t) => {
      tr = t;
    });
    const result = state.apply(tr);

    expect(applied).toBe(true);
    expect(result.doc.firstChild?.type).toBe(schema.nodes.paragraph);
  });

  it("is a no-op outside a list", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = stateFromDoc(doc);

    expect(
      outdentListItem(state, () => {
        throw new Error("dispatch should not be called");
      }),
    ).toBe(false);
  });
});

describe("indentListItem", () => {
  it("sinks a list item under its preceding sibling", () => {
    const doc = schema.node("doc", null, [
      schema.node("bulletList", null, [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("First")]),
        ]),
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Second")]),
        ]),
      ]),
    ]);
    const secondItemTextPos = doc.content.size - 2;
    const state = stateFromDoc(doc, secondItemTextPos);
    let tr = state.tr;
    const applied = indentListItem(state, (t) => {
      tr = t;
    });
    state.apply(tr);

    expect(applied).toBe(true);
  });

  it("is a no-op for the first item with no sibling to nest under", () => {
    const doc = schema.node("doc", null, [
      schema.node("bulletList", null, [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Only")]),
        ]),
      ]),
    ]);
    const state = stateFromDoc(doc, 2);

    expect(indentListItem(state, () => {})).toBe(false);
  });
});
