import { describe, it, expect } from "vitest";
import {
  filterAuthSteps,
  partitionAuthSteps,
  resolveAuthImports,
  renderAuthStep,
  resolveAuthStepRequirements,
} from "../webClients/nextjs/v16/event-generators/authStepResolver";
import { generateSimpleButtonEventTemplate } from "../webClients/nextjs/v16/event-generators/templates/simpleButtonEventTemplate";
import { generateInteractiveFormEventTemplate } from "../webClients/nextjs/v16/event-generators/templates/interactiveFormEventTemplate";
import { generateEventComponent } from "../webClients/nextjs/v16/eventGenerators";
import type { FrontendActionStepDraft } from "@workspace/canvas";

describe("compileAuthActionStep - authStepResolver & event templates", () => {
  it("filters and partitions auth steps around API call step", () => {
    const steps: FrontendActionStepDraft[] = [
      { id: "s1", order: 1, type: "auth", authOperation: "signInSocial", authProvider: "github" },
      { id: "s2", order: 2, type: "api_call", endpointId: "ep1" },
      { id: "s3", order: 3, type: "auth", authOperation: "signOut" },
    ];

    const authSteps = filterAuthSteps(steps);
    expect(authSteps).toHaveLength(2);

    const { preAuthSteps, postAuthSteps } = partitionAuthSteps(steps, true);
    expect(preAuthSteps).toHaveLength(1);
    expect(preAuthSteps[0]?.authOperation).toBe("signInSocial");
    expect(postAuthSteps).toHaveLength(1);
    expect(postAuthSteps[0]?.authOperation).toBe("signOut");
  });

  it("renders code for various auth operations", () => {
    const map = new Map<string, string>();
    const ctx = {};

    const signOutCode = renderAuthStep(
      { id: "a1", order: 1, type: "auth", authOperation: "signOut" },
      map,
      ctx
    );
    expect(signOutCode).toContain("await authClient.signOut();");

    const socialCode = renderAuthStep(
      {
        id: "a2",
        order: 1,
        type: "auth",
        authOperation: "signInSocial",
        authProvider: "github",
        authCallbackUrl: "/dashboard",
      },
      map,
      ctx
    );
    expect(socialCode).toContain(
      'await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });'
    );

    const sessionCode = renderAuthStep(
      {
        id: "a3",
        order: 1,
        type: "auth",
        authOperation: "getSession",
        authOutputVariable: "mySession",
      },
      map,
      ctx
    );
    expect(sessionCode).toContain("const mySession = await authClient.getSession();");
  });

  it("resolves store and param requirements for auth steps", () => {
    const steps: FrontendActionStepDraft[] = [
      {
        id: "a1",
        order: 1,
        type: "auth",
        authOperation: "signInEmail",
        authEmailSource: { kind: "state_var", storeName: "UserStore", stateKey: "email" },
        authPasswordSource: { kind: "route_param", paramName: "token" },
      },
    ];

    const reqs = resolveAuthStepRequirements(steps);
    expect(reqs.storeNames).toEqual(["User"]);
    expect(reqs.needsUseParams).toBe(true);
    expect(reqs.needsUseSearchParams).toBe(false);
  });

  it("generates simpleButtonEventTemplate with authClient import and signOut call", () => {
    const code = generateSimpleButtonEventTemplate({
      componentName: "LogoutButton",
      eventName: "Logout",
      eventType: "click",
      url: "",
      upperMethod: "POST",
      typeDefs: ["export interface LogoutButtonProps { onTrigger?: () => void; }"],
      actionSteps: [
        {
          id: "step-logout",
          order: 1,
          type: "auth",
          authOperation: "signOut",
        },
        {
          id: "step-nav",
          order: 2,
          type: "navigation",
          targetRoute: "/login",
        },
      ],
    });

    expect(code).toContain('import { authClient } from "@/lib/auth-client";');
    expect(code).toContain("await authClient.signOut();");
    expect(code).toContain("router.push(`/login`);");
  });

  it("generateEventComponent treats action with auth step as active execution, not pure navigation", () => {
    const code = generateEventComponent(
      "Logout",
      "click",
      "",
      "POST",
      "LogoutAction",
      "/login",
      "Login",
      false,
      undefined,
      undefined,
      undefined,
      {
        id: "evt-logout",
        name: "Logout",
        event: "click",
        actionSteps: [
          {
            id: "s1",
            order: 1,
            type: "auth",
            authOperation: "signOut",
          },
          {
            id: "s2",
            order: 2,
            type: "navigation",
            targetRoute: "/login",
          },
        ],
      }
    );

    // Must NOT be a passive <Link href="/login"> component
    expect(code).not.toContain('import Link from "next/link";');
    // Must be a client component invoking authClient.signOut()
    expect(code).toContain('import { authClient } from "@/lib/auth-client";');
    expect(code).toContain("await authClient.signOut();");
  });
});
