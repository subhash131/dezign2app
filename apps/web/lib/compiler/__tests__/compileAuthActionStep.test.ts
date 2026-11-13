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
import { generateRouteGroupLayouts } from "../webClients/nextjs/v16/layoutGenerators";
import { generateSectionComponent } from "../webClients/nextjs/v16/sectionGenerators";
import type { FrontendActionStepDraft, PageSection } from "@workspace/canvas";
import type { BackendNode } from "@/types/canvas";
import type { PageInfo } from "../webClients/nextjs/v16/types";

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
    expect(code).toContain("router?.push(`/login`);");
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

  it("generateRouteGroupLayouts compiles layout sections with configured auth actions into standalone action files and connects them to SidebarActionButton", () => {
    const layoutNode: BackendNode = {
      id: "node-layout-private",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        isLayout: true,
        label: "layout",
        routeGroup: "private",
        sections: [
          {
            id: "sec-nav",
            name: "App Sidebar Navigation",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-logout",
                name: "logout",
                event: "click",
                actionSteps: [
                  {
                    id: "step-auth-logout",
                    order: 1,
                    type: "auth",
                    authOperation: "signOut",
                  },
                ],
              },
            ],
            componentBindings: [
              {
                id: "comp-sidebar",
                name: "AppSidebar",
                componentType: "sidebar",
                propMappings: {
                  sidebarStaticItems: [
                    { id: "item-dash", name: "Dashboard", link: "/dashboard" },
                    { id: "item-logout", name: "Logout", actionName: "logout" },
                  ],
                },
              },
            ],
          },
          {
            id: "sec-children",
            name: "Page Content ({children})",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
            componentBindings: [],
          },
        ],
      },
    };

    const pagesInfo: PageInfo[] = [
      {
        nodeId: layoutNode.id,
        label: "PrivateLayout",
        slug: "private-layout",
        routePath: "/dashboard",
        componentName: "PrivateLayout",
        isLayout: true,
        routeGroup: "private",
        routeGroupPath: "(private)",
        isRoot: false,
        accessType: "private",
      },
      {
        nodeId: "node-page-dash",
        label: "DashboardPage",
        slug: "dashboard",
        routePath: "/dashboard",
        componentName: "DashboardPage",
        isLayout: false,
        routeGroup: "private",
        routeGroupPath: "(private)",
        isRoot: false,
        accessType: "private",
      },
    ];

    const authNode: BackendNode = {
      id: "auth-1",
      type: "auth",
      position: { x: 0, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Auth",
      },
    };

    const files = generateRouteGroupLayouts(
      pagesInfo,
      true,
      undefined,
      [layoutNode, authNode],
      [],
      authNode,
    );

    // 1. Emits standalone LogoutAction file inside layout _components
    const logoutActionFile = files.find((f) => f.filename === "app/(private)/_components/LogoutAction.tsx");
    expect(logoutActionFile).toBeDefined();
    expect(logoutActionFile?.content).toContain("export async function handleLogoutAction");
    expect(logoutActionFile?.content).toContain("await authClient.signOut();");

    // 2. Emits SidebarActionButton that imports and calls handleLogoutAction
    const sidebarActionBtnFile = files.find((f) => f.filename === "app/(private)/_components/SidebarActionButton.tsx");
    expect(sidebarActionBtnFile).toBeDefined();
    expect(sidebarActionBtnFile?.content).toContain('import { handleLogoutAction } from "./LogoutAction";');
    expect(sidebarActionBtnFile?.content).toContain('"logout": () => handleLogoutAction()');

    // 3. Emits layout.tsx using <SidebarActionButton actionName="logout"
    const layoutFile = files.find((f) => f.filename === "app/(private)/layout.tsx");
    expect(layoutFile).toBeDefined();
    expect(layoutFile?.content).toContain('<SidebarActionButton actionName="logout" actionId="" tooltip="Logout"');
  });

  it("generateSectionComponent generates decoupled action handlers and binds them to mapped UI components", () => {
    const section: PageSection = {
      id: "sec-main",
      name: "Main Section",
      renderMode: "client",
      actions: [
        {
          id: "act-submit",
          name: "SubmitForm",
          event: "click",
        },
      ],
      componentBindings: [
        {
          id: "btn-submit",
          name: "SubmitButton",
          componentType: "button",
          label: "Submit Order",
          actionId: "act-submit",
          actionName: "SubmitForm",
        },
      ],
    };

    const eventComponents = [
      {
        componentName: "SubmitFormAction",
        eventName: "SubmitForm",
        eventType: "click",
        url: "/api/orders",
        method: "POST",
        eventItem: {
          id: "act-submit",
          name: "SubmitForm",
          event: "click",
        },
      },
    ];

    const code = generateSectionComponent(section, "MainSection", eventComponents);

    // Mapped component imports the decoupled action handler
    expect(code).toContain('import { handleSubmitFormAction } from "./SubmitFormAction";');

    // Mapped button attaches the function to its onClick
    expect(code).toContain("onClick={async () => { await handleSubmitFormAction({ onTrigger }); }}");

    // No duplicate unmapped fallback button rendered
    expect(code).not.toContain("<SubmitFormAction onTrigger={onTrigger} />");
  });
});
