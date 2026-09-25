import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFloatingPanelLayout } from "./use-floating-panel-layout";

function fireMouseDown(
  handler: (event: React.MouseEvent) => void,
  clientX: number,
  clientY: number,
) {
  handler({
    button: 0,
    clientX,
    clientY,
    stopPropagation: () => {},
  } as unknown as React.MouseEvent);
}

describe("useFloatingPanelLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts with the default, unmoved layout", () => {
    const { result } = renderHook(() => useFloatingPanelLayout("test-layout"));

    expect(result.current.layout).toEqual({
      dx: 0,
      dy: 0,
      width: null,
      height: null,
      collapsed: false,
    });
  });

  it("resizes by the caller-computed size from the raw mouse delta", () => {
    const { result } = renderHook(() =>
      useFloatingPanelLayout("test-layout", { minWidth: 200, minHeight: 100 }),
    );

    act(() => {
      fireMouseDown(
        (event) =>
          result.current.startResize(event, (deltaX, deltaY) => ({
            width: 400 + deltaX,
            height: 300 + deltaY,
          })),
        0,
        0,
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 50, clientY: -20 }),
      );
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.layout.width).toBe(450);
    expect(result.current.layout.height).toBe(280);
  });

  it("clamps to the minimum size", () => {
    const { result } = renderHook(() =>
      useFloatingPanelLayout("test-layout", { minWidth: 200, minHeight: 100 }),
    );

    act(() => {
      fireMouseDown(
        (event) =>
          result.current.startResize(event, (deltaX) => ({
            width: 250 + deltaX,
            height: 150,
          })),
        0,
        0,
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: -1000, clientY: 0 }),
      );
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.layout.width).toBe(200);
  });

  it("resets back to the default layout", () => {
    const { result } = renderHook(() => useFloatingPanelLayout("test-layout"));

    act(() => {
      fireMouseDown((event) => result.current.startDrag(event), 0, 0);
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 30, clientY: 30 }),
      );
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(result.current.layout.dx).toBe(30);

    act(() => result.current.reset());

    expect(result.current.layout).toEqual({
      dx: 0,
      dy: 0,
      width: null,
      height: null,
      collapsed: false,
    });
  });

  it("calls the onRelease callback with the mouseup event, without persisting anything itself", () => {
    const { result } = renderHook(() => useFloatingPanelLayout("test-layout"));
    const onRelease = vi.fn();

    act(() => {
      fireMouseDown(
        (event) => result.current.startDrag(event, onRelease),
        0,
        0,
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 50, clientY: 0 }),
      );
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 50 }));
    });

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease.mock.calls[0]?.[0]).toMatchObject({ clientX: 50 });
    // onRelease is purely informational — the drag's own dx/dy persistence
    // already happened via mousemove, unaffected by what onRelease does.
    expect(result.current.layout.dx).toBe(50);
  });

  it("persists layout to localStorage under the given key, isolated from other keys", () => {
    const { result: a } = renderHook(() => useFloatingPanelLayout("panel-a"));
    const { result: b } = renderHook(() => useFloatingPanelLayout("panel-b"));

    act(() => a.current.toggleCollapsed());

    expect(a.current.layout.collapsed).toBe(true);
    expect(b.current.layout.collapsed).toBe(false);
    expect(JSON.parse(localStorage.getItem("panel-a")!).collapsed).toBe(true);
    expect(localStorage.getItem("panel-b")).toBeNull();
  });
});
