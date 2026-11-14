import { describe, it, expect } from "vitest";
import { generateAuthFormComponent } from "../webClients/nextjs/v16/authPageGenerators";
import { resolveConnectedAuthNode } from "../webClients/nextjs/v16/authFileGenerator";
import { PageInfo } from "../webClients/nextjs/v16/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { AuthCompilerNodeData } from "../compileAuth";

describe("Auth Redirect Routes Compilation", () => {
  const loginPageMeta: PageInfo = {
    nodeId: "page-login",
    label: "/login",
    slug: "login",
    routePath: "/login",
    componentName: "LoginPage",
    isRoot: false,
    isAuthPage: true,
  };

  const chatPageMeta: PageInfo = {
    nodeId: "page-chat",
    label: "/chat/[id]",
    slug: "chat/[id]",
    routePath: "/chat/[id]",
    componentName: "ChatIdPage",
    isRoot: false,
  };

  it("should compile custom signInRedirectUrl to LoginForm even with a stale nodeId pointing to chat page", () => {
    const authNodeData: AuthCompilerNodeData = {
      framework: "better_auth",
      redirects: {
        signInRedirectUrl: "/dashboard",
        signInRedirectNodeId: "page-chat", // Stale nodeId from previous selection
        signUpRedirectUrl: "/onboarding",
        signUpRedirectNodeId: "page-chat",
      },
      providers: {
        emailPassword: {
          enabled: true,
          minLength: 8,
          requireVerification: false,
        },
      },
    };

    const formCode = generateAuthFormComponent(loginPageMeta, authNodeData, [loginPageMeta, chatPageMeta]);

    // effectiveSignInRedirect should use /dashboard, NOT the stale /chat/[id]
    expect(formCode).toContain('const effectiveSignInRedirect = redirectParam || "/dashboard";');
    expect(formCode).toContain('const effectiveSignUpRedirect = redirectParam || "/onboarding";');
    expect(formCode).not.toContain('"/chat/[id]"');
  });

  it("should use linked canvas node route if custom fallback matches it", () => {
    const authNodeData: AuthCompilerNodeData = {
      framework: "better_auth",
      redirects: {
        signInRedirectUrl: "/chat/[id]",
        signInRedirectNodeId: "page-chat",
      },
    };

    const formCode = generateAuthFormComponent(loginPageMeta, authNodeData, [loginPageMeta, chatPageMeta]);

    expect(formCode).toContain('const effectiveSignInRedirect = redirectParam || "/chat/[id]";');
  });

  it("should resolve single Auth node on canvas even if not explicitly edge-connected to WebApp", () => {
    const authNode: BackendNode = {
      id: "node-auth",
      type: "auth",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Auth",
        framework: "better_auth",
        redirects: {
          signInRedirectUrl: "/dashboard",
          signUpRedirectUrl: "/onboarding",
          signInPageUrl: "/login",
          signUpPageUrl: "/register",
        },
        providers: {
          emailPassword: {
            enabled: true,
            minLength: 8,
            requireVerification: false,
          },
        },
      },
    };

    const webAppNode: BackendNode = {
      id: "node-webapp",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Web App",
        authNodeId: "node-auth",
      },
    };

    const homeNode: BackendNode = {
      id: "node-home",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "/",
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "e1",
        source: "node-webapp",
        target: "node-home",
        sourceHandle: "public-in",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [homeNode],
      [],
      [],
      [webAppNode, homeNode, authNode],
      edges,
      "TestProject",
      [],
      "web-app",
      webAppNode,
    );

    const loginForm = result.files.find((f) => f.filename.endsWith("login/_components/LoginForm.tsx"));
    expect(loginForm).toBeDefined();
    expect(loginForm?.content).toContain('const effectiveSignInRedirect = redirectParam || "/dashboard";');
    expect(loginForm?.content).toContain('const effectiveSignUpRedirect = redirectParam || "/onboarding";');
  });
});
