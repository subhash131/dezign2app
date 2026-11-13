import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComponentEventActionCard } from "../web-page-component-config/ComponentEventActionCard";
import {
  findSuggestedAuthAction,
  createBuiltinAuthAction,
  BUILTIN_AUTH_ACTIONS,
} from "../web-page-component-config/builtinAuthActions";

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
    <div data-testid="mock-select" data-value={value}>
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
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectLabel: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectSeparator: () => <hr />,
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value?: string;
  }) => <div data-value={value}>{children}</div>,
}));

describe("Built-in Better Auth Actions & ComponentEventActionCard", () => {
  it("suggests auth:signOut when element label is Logout or Sign Out", () => {
    const logoutMatch = findSuggestedAuthAction("Logout");
    expect(logoutMatch).toBeDefined();
    expect(logoutMatch?.key).toBe("auth:signOut");

    const signOutMatch = findSuggestedAuthAction("Sign Out");
    expect(signOutMatch).toBeDefined();
    expect(signOutMatch?.key).toBe("auth:signOut");

    const unrelated = findSuggestedAuthAction("Save Settings");
    expect(unrelated).toBeUndefined();
  });

  it("createBuiltinAuthAction generates signOut action with auth and navigation steps", () => {
    const action = createBuiltinAuthAction("auth:signOut", "/login");
    expect(action.name).toBe("signOut");
    expect(action.url).toBe("/api/auth/sign-out");
    expect(action.method).toBe("POST");
    expect(action.actionSteps?.length).toBe(2);

    const authStep = action.actionSteps?.[0];
    expect(authStep?.type).toBe("auth");
    expect(authStep?.authOperation).toBe("signOut");

    const navStep = action.actionSteps?.[1];
    expect(navStep?.type).toBe("navigation");
    expect(navStep?.targetRoute).toBe("/login");
  });

  it("renders Better-Auth quick-wire suggestion banner when isAuthConnected=true for Logout element", () => {
    const onSelectBuiltinAuthAction = vi.fn();
    const onUpdate = vi.fn();
    const onCreateAction = vi.fn();

    render(
      <ComponentEventActionCard
        elementLabel="Logout"
        elementType="button"
        availableActions={[]}
        onUpdate={onUpdate}
        onCreateAction={onCreateAction}
        isAuthConnected={true}
        authNodeLabel="Better Auth"
        onSelectBuiltinAuthAction={onSelectBuiltinAuthAction}
      />,
    );

    expect(screen.getByText(/Quick-Wire Better Auth: Sign Out \/ Logout/i)).toBeDefined();
    expect(screen.getAllByText(/POST \/api\/auth\/sign-out/i).length).toBeGreaterThan(0);

    const autoWireBtn = screen.getByRole("button", { name: /Auto-Wire/i });
    expect(autoWireBtn).toBeDefined();
    fireEvent.click(autoWireBtn);

    expect(onSelectBuiltinAuthAction).toHaveBeenCalledWith("auth:signOut");
  });

  it("displays wired status and badge when an action is bound", () => {
    const onUpdate = vi.fn();
    const onCreateAction = vi.fn();

    render(
      <ComponentEventActionCard
        elementLabel="Logout"
        elementType="button"
        actionId="act-auth-signout-1"
        actionName="signOut"
        availableActions={[
          {
            id: "act-auth-signout-1",
            name: "signOut",
            event: "click",
            actionType: "auth_builtin",
            actionSteps: [{ id: "step-1", order: 1, type: "api_call" }],
          },
        ]}
        onUpdate={onUpdate}
        onCreateAction={onCreateAction}
        isAuthConnected={true}
      />,
    );

    expect(screen.getByText("Wired: signOut")).toBeDefined();
    // Quick-wire banner is hidden once wired
    expect(screen.queryByText(/Quick-Wire Better Auth/i)).toBeNull();
  });

  it("does not render built-in auth functions inside the action workflow dropdown", () => {
    render(
      <ComponentEventActionCard
        elementLabel="AppSidebar"
        elementType="sidebar"
        availableActions={[
          {
            id: "act-demo",
            name: "demo",
            event: "click",
            actionSteps: [],
          },
        ]}
        onUpdate={vi.fn()}
        onCreateAction={vi.fn()}
        isAuthConnected={true}
      />,
    );

    // It should render actual action workflows
    expect(screen.getByText("demo")).toBeDefined();
    // It should NOT render the Better-Auth Built-in Functions group in the dropdown
    expect(screen.queryByText(/Better-Auth Built-in Functions/i)).toBeNull();
  });
});
