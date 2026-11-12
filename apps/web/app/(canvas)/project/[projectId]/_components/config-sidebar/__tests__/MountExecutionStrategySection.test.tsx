import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MountExecutionStrategySection } from "../web-page-event-config/MountExecutionStrategySection";
import type { MountConfig } from "@workspace/canvas/types";

describe("MountExecutionStrategySection", () => {
  it("renders with default client strategy selected", () => {
    const config: MountConfig = { strategy: "client" };
    const onChange = vi.fn();

    render(
      <MountExecutionStrategySection
        mountConfig={config}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Client (useEffect)")).toBeDefined();
    expect(screen.getByText("Server-Side (SSR)")).toBeDefined();
    expect(screen.getByText(/Runs in the user's browser after mount/i)).toBeDefined();
    expect(screen.getByText(/Client Component/i)).toBeDefined();
  });

  it("switches to SSR when Server-Side card is clicked", () => {
    const config: MountConfig = { strategy: "client" };
    const onChange = vi.fn();

    render(
      <MountExecutionStrategySection
        mountConfig={config}
        onChange={onChange}
      />
    );

    const ssrCard = screen.getByText("Server-Side (SSR)");
    fireEvent.click(ssrCard);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: "ssr",
        cacheMode: "no-store",
      })
    );
  });

  it("shows cache mode options and warning when SSR is selected on a protected page", () => {
    const config: MountConfig = { strategy: "ssr", cacheMode: "no-store" };
    const onChange = vi.fn();

    render(
      <MountExecutionStrategySection
        mountConfig={config}
        onChange={onChange}
        isProtected={true}
      />
    );

    expect(screen.getByText(/Notice:/i)).toBeDefined();
    expect(screen.getByText("Next.js Cache Strategy")).toBeDefined();
    expect(screen.getByText("Dynamic (no-store)")).toBeDefined();
    expect(screen.getByText("Static (force-cache)")).toBeDefined();
    expect(screen.getByText("ISR (revalidate)")).toBeDefined();
    expect(screen.getByText(/Server Component/i)).toBeDefined();
  });

  it("updates cacheMode when an option is clicked", () => {
    const config: MountConfig = { strategy: "ssr", cacheMode: "no-store" };
    const onChange = vi.fn();

    render(
      <MountExecutionStrategySection
        mountConfig={config}
        onChange={onChange}
      />
    );

    const isrButton = screen.getByText("ISR (revalidate)");
    fireEvent.click(isrButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheMode: "revalidate",
      })
    );
  });

  it("renders revalidate input when revalidate cache mode is active", () => {
    const config: MountConfig = {
      strategy: "ssr",
      cacheMode: "revalidate",
      revalidateSeconds: 120,
    };
    const onChange = vi.fn();

    render(
      <MountExecutionStrategySection
        mountConfig={config}
        onChange={onChange}
      />
    );

    const input = screen.getByDisplayValue("120");
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        revalidateSeconds: 300,
      })
    );
  });
});
