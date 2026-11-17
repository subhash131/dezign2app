import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaywallModal } from "./paywall-modal";
import { useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";

// Mock the hooks
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "user_123", email: "user@example.com" } },
    isPending: false,
  })),
  useActiveOrganization: vi.fn(() => ({ data: null })),
  useListOrganizations: vi.fn(() => ({ data: [] })),
  authClient: {
    organization: {
      setActive: vi.fn(),
    },
  },
}));

describe("PaywallModal", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    } as any);
    vi.mocked(usePathname).mockReturnValue("/project/123"); // required route by default
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders children when subscription is active", () => {
    vi.mocked(useQuery).mockReturnValue({ status: "active" });

    render(
      <PaywallModal>
        <div data-testid="child">Active Content</div>
      </PaywallModal>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText("Subscription Expired")).not.toBeInTheDocument();
  });

  it("shows modal when user has no subscription on a required route", () => {
    vi.mocked(useQuery).mockReturnValue({ status: "no_subscription" });

    render(
      <PaywallModal>
        <div data-testid="child">Should be hidden</div>
      </PaywallModal>,
    );

    expect(
      screen.getByText("Active Subscription Required"),
    ).toBeInTheDocument();
    expect(screen.getByText("View Plans & Upgrade")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("shows non-dismissible modal when subscription is inactive on a required route", () => {
    vi.mocked(useQuery).mockReturnValue({ status: "inactive" });

    render(
      <PaywallModal>
        <div data-testid="child">Should be hidden</div>
      </PaywallModal>,
    );

    expect(screen.getByText("Subscription Expired")).toBeInTheDocument();
    expect(screen.getByText("View Plans & Upgrade")).toBeInTheDocument();
    // It should NOT have the dismiss option
    expect(
      screen.queryByText("Continue in View-Only Mode"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Return to Workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders children immediately on a free route like /admin", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/settings");
    vi.mocked(useQuery).mockReturnValue({ status: "inactive" }); // Even if inactive

    render(
      <PaywallModal>
        <div data-testid="child">Active Content</div>
      </PaywallModal>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText("Subscription Expired")).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows dismissible modal initially on a readonly route, then reveals children when dismissed", () => {
    vi.mocked(usePathname).mockReturnValue("/projects");
    vi.mocked(useQuery).mockReturnValue({ status: "inactive" });

    render(
      <PaywallModal>
        <div data-testid="child">Active Content</div>
      </PaywallModal>,
    );

    // Children are rendered behind the modal
    expect(screen.getByTestId("child")).toBeInTheDocument();

    // Modal is visible
    expect(screen.getByText("Subscription Expired")).toBeInTheDocument();

    // Dismiss button exists and can be clicked
    const dismissButton = screen.getByText("Continue in View-Only Mode");
    expect(dismissButton).toBeInTheDocument();

    // Dismiss the modal
    fireEvent.click(dismissButton);

    // Modal should be gone
    expect(screen.queryByText("Subscription Expired")).not.toBeInTheDocument();

    // Banner should appear
    expect(
      screen.getByText(
        "Your subscription has expired. You are currently in view-only mode.",
      ),
    ).toBeInTheDocument();
  });
});
