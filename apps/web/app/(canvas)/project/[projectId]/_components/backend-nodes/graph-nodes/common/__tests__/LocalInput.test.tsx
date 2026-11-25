import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { LocalTextarea, LocalInput } from "../LocalInput";

describe("LocalTextarea", () => {
  it("provides instant local value updates and debounces onChange", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalTextarea value="initial" onChange={onChange} debounceMs={200} />,
    );

    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("initial");

    // Type new text
    act(() => {
      fireEvent.change(textarea, { target: { value: "initial typing..." } });
    });

    // Local value updates immediately (0ms typing lag)
    expect(textarea.value).toBe("initial typing...");
    // onChange has not fired yet because it's debounced
    expect(onChange).not.toHaveBeenCalled();

    // Advance time past debounce delay
    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("initial typing...");
    vi.useRealTimers();
  });

  it("flushes immediately on blur", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalTextarea value="start" onChange={onChange} debounceMs={300} />,
    );

    const textarea = getByRole("textbox") as HTMLTextAreaElement;

    act(() => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, { target: { value: "immediate flush test" } });
    });

    expect(onChange).not.toHaveBeenCalled();

    // Blur before timer expires
    act(() => {
      fireEvent.blur(textarea);
    });

    // Immediately committed
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("immediate flush test");
    vi.useRealTimers();
  });

  it("handles Tab key indentation without losing cursor position", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalTextarea value="hello" onChange={onChange} debounceMs={200} />,
    );

    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;

    act(() => {
      fireEvent.keyDown(textarea, { key: "Tab" });
    });

    expect(textarea.value).toBe("hello  ");

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("hello  ");
    vi.useRealTimers();
  });

  it("flushes pending edits on unmount so data is never lost", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole, unmount } = render(
      <LocalTextarea value="draft" onChange={onChange} debounceMs={300} />,
    );

    const textarea = getByRole("textbox") as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: "unmounting save" } });
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("unmounting save");
    vi.useRealTimers();
  });

  it("flushes immediately on Enter keypress", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalTextarea value="draft" onChange={onChange} debounceMs={250} />,
    );

    const textarea = getByRole("textbox") as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: "full prompt text" } });
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("full prompt text");
    vi.useRealTimers();
  });
});

describe("LocalInput", () => {
  it("updates synchronously when debounceMs is 0", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalInput value="initial" onChange={onChange} debounceMs={0} />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "updated" } });
    });

    expect(input.value).toBe("updated");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("debounces by default (300ms)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalInput value="initial" onChange={onChange} />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "debounced" } });
    });

    expect(input.value).toBe("debounced");
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("debounced");
    vi.useRealTimers();
  });

  it("flushes immediately on Enter keypress", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { getByRole } = render(
      <LocalInput value="myFunc" onChange={onChange} debounceMs={200} />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "myRenamedFunc" } });
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe("myRenamedFunc");
    vi.useRealTimers();
  });
});
