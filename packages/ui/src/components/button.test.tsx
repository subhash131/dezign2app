import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@workspace/ui/components/button";

describe("Button", () => {
  it("renders correctly with children", () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText("Click Me")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    fireEvent.click(screen.getByText("Click Me"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("can be disabled", () => {
    render(<Button disabled>Disabled Button</Button>);
    expect(screen.getByText("Disabled Button")).toBeDisabled();
  });
});
