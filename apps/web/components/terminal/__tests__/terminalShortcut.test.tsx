import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { isTerminalToggleShortcut } from "../terminalUtils";

const mockAttachCustomKeyEventHandler = vi.fn();
const mockDispose = vi.fn();

vi.mock("@xterm/xterm", () => {
  return {
    Terminal: vi.fn().mockImplementation(() => ({
      loadAddon: vi.fn(),
      open: vi.fn(),
      attachCustomKeyEventHandler: mockAttachCustomKeyEventHandler,
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onResize: vi.fn(() => ({ dispose: vi.fn() })),
      write: vi.fn(),
      focus: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ""),
      selectAll: vi.fn(),
      dispose: mockDispose,
    })),
  };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
}));

vi.mock("@/lib/electron", () => ({
  openExternalUrl: vi.fn(),
}));

import { XTermTerminal } from "../XTermTerminal";

describe("isTerminalToggleShortcut", () => {
  it("matches Ctrl+J and Cmd+J regardless of case or code", () => {
    expect(
      isTerminalToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: "j",
        code: "KeyJ",
      }),
    ).toBe(true);

    expect(
      isTerminalToggleShortcut({
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        key: "J",
        code: "KeyJ",
      }),
    ).toBe(true);
  });

  it("does not match when Shift or Alt is held or for other keys", () => {
    expect(
      isTerminalToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        key: "J",
        code: "KeyJ",
      }),
    ).toBe(false);

    expect(
      isTerminalToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false,
        key: "j",
        code: "KeyJ",
      }),
    ).toBe(false);

    expect(
      isTerminalToggleShortcut({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: "j",
        code: "KeyJ",
      }),
    ).toBe(false);

    expect(
      isTerminalToggleShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: "c",
        code: "KeyC",
      }),
    ).toBe(false);
  });
});

describe("XTermTerminal Ctrl+J handling", () => {
  beforeEach(() => {
    mockAttachCustomKeyEventHandler.mockClear();
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it("blocks xterm from processing Ctrl+J and invokes onToggleExpand", () => {
    const onToggleExpand = vi.fn();
    render(<XTermTerminal onToggleExpand={onToggleExpand} />);

    expect(mockAttachCustomKeyEventHandler).toHaveBeenCalledTimes(1);
    const handler = mockAttachCustomKeyEventHandler.mock.calls[0]![0] as (
      e: KeyboardEvent,
    ) => boolean;

    const event = new KeyboardEvent("keydown", {
      key: "j",
      code: "KeyJ",
      ctrlKey: true,
      cancelable: true,
    });

    const allowed = handler(event);
    expect(allowed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("allows normal keys through to xterm", () => {
    render(<XTermTerminal />);
    const handler = mockAttachCustomKeyEventHandler.mock.calls[0]![0] as (
      e: KeyboardEvent,
    ) => boolean;

    const event = new KeyboardEvent("keydown", {
      key: "j",
      code: "KeyJ",
      ctrlKey: false,
      cancelable: true,
    });

    expect(handler(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });
});
