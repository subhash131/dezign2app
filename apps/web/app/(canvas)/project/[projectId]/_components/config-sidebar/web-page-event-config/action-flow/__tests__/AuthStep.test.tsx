import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthStep } from "../AuthStep";
import { createDefaultFrontendStep } from "../frontendStepFactory";
import { formatStepCodePreview } from "../FrontendStepRowHeader";
import type { FrontendActionStepDraft } from "../types";

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (val: string) => void;
  }) => (
    <div
      data-testid="mock-select"
      data-value={value}
      onClick={() => onValueChange?.("signInSocial")}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value?: string;
  }) => <div data-value={value}>{children}</div>,
}));

describe("AuthStep and frontendStepFactory", () => {
  it("creates a default auth step via createDefaultFrontendStep", () => {
    const step = createDefaultFrontendStep("auth", 1);
    expect(step.type).toBe("auth");
    expect(step.name).toBe("Auth Action");
    expect(step.authOperation).toBe("signOut");
    expect(step.authOutputVariable).toBe("authResult");
  });

  it("formats preview code for different auth operations", () => {
    const signOutStep: FrontendActionStepDraft = {
      id: "s1",
      order: 1,
      type: "auth",
      name: "Logout",
      authOperation: "signOut",
    };
    expect(formatStepCodePreview(signOutStep, [], [])).toBe("await authClient.signOut()");

    const socialStep: FrontendActionStepDraft = {
      id: "s2",
      order: 1,
      type: "auth",
      name: "Social Login",
      authOperation: "signInSocial",
      authProvider: "github",
    };
    expect(formatStepCodePreview(socialStep, [], [])).toBe(
      'await authClient.signIn.social({ provider: "github" })'
    );

    const emailStep: FrontendActionStepDraft = {
      id: "s3",
      order: 1,
      type: "auth",
      name: "Email Login",
      authOperation: "signInEmail",
    };
    expect(formatStepCodePreview(emailStep, [], [])).toBe(
      "await authClient.signIn.email({ email, password })"
    );

    const orgStep: FrontendActionStepDraft = {
      id: "s4",
      order: 1,
      type: "auth",
      name: "Set Org",
      authOperation: "setActiveOrg",
    };
    expect(formatStepCodePreview(orgStep, [], [])).toBe(
      "await authClient.organization.setActive({ organizationId })"
    );

    const sessionStep: FrontendActionStepDraft = {
      id: "s5",
      order: 1,
      type: "auth",
      name: "Get Session",
      authOperation: "getSession",
    };
    expect(formatStepCodePreview(sessionStep, [], [])).toBe(
      "await authClient.getSession()"
    );
  });

  it("renders AuthStep component for signOut with guidance text", () => {
    const step: FrontendActionStepDraft = {
      id: "step-auth-1",
      order: 1,
      type: "auth",
      name: "Logout",
      authOperation: "signOut",
    };

    const onUpdate = vi.fn();

    render(
      <AuthStep
        draft={step}
        onChange={onUpdate}
        allNodes={[]}
      />
    );

    expect(screen.getByText("Auth Operation")).toBeDefined();
    expect(
      screen.getByText(/Session Termination/i)
    ).toBeDefined();
    expect(
      screen.getByText(/invalidate the server session/i)
    ).toBeDefined();
  });

  it("renders social provider selector and callback URL for signInSocial", () => {
    const step: FrontendActionStepDraft = {
      id: "step-auth-2",
      order: 1,
      type: "auth",
      name: "Social Login",
      authOperation: "signInSocial",
      authProvider: "google",
      authCallbackUrl: "/dashboard",
    };

    const onUpdate = vi.fn();

    render(
      <AuthStep
        draft={step}
        onChange={onUpdate}
        allNodes={[]}
      />
    );

    expect(screen.getByText("OAuth Social Provider")).toBeDefined();
    expect(screen.getByText("Post-Login Callback URL")).toBeDefined();

    const callbackInput = screen.getByDisplayValue("/dashboard");
    expect(callbackInput).toBeDefined();

    fireEvent.change(callbackInput, { target: { value: "/home" } });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        authCallbackUrl: "/home",
      })
    );
  });
});

