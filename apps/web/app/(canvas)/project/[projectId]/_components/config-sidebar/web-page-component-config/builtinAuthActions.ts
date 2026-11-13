import type { UIEventItem, FrontendActionStepDraft } from "@workspace/canvas";

export type BuiltinAuthActionKey =
  | "auth:signOut"
  | "auth:signInSocial"
  | "auth:signInEmail"
  | "auth:signUpEmail"
  | "auth:setActiveOrg"
  | "auth:leaveOrg";

export interface BuiltinAuthActionOption {
  key: BuiltinAuthActionKey;
  label: string;
  subLabel: string;
  method: "POST" | "GET";
  url: string;
  defaultActionName: string;
  event: string;
  suggestedLabels: string[];
  defaultRedirect?: string;
  stepsDescription: string;
}

export const BUILTIN_AUTH_ACTIONS: BuiltinAuthActionOption[] = [
  {
    key: "auth:signOut",
    label: "Sign Out / Logout",
    subLabel: "Better Auth session termination (authClient.signOut())",
    method: "POST",
    url: "/api/auth/sign-out",
    defaultActionName: "signOut",
    event: "click",
    suggestedLabels: ["logout", "sign out", "signout", "log out", "exit", "disconnect"],
    defaultRedirect: "/login",
    stepsDescription: "POST /api/auth/sign-out → Redirect to /login",
  },
  {
    key: "auth:signInSocial",
    label: "Social Sign In (OAuth)",
    subLabel: "Better Auth social provider login (authClient.signIn.social())",
    method: "POST",
    url: "/api/auth/sign-in/social",
    defaultActionName: "signInSocial",
    event: "click",
    suggestedLabels: [
      "google",
      "github",
      "social",
      "oauth",
      "sign in with google",
      "continue with google",
      "social login",
    ],
    defaultRedirect: "/",
    stepsDescription: "POST /api/auth/sign-in/social",
  },
  {
    key: "auth:signInEmail",
    label: "Sign In with Email",
    subLabel: "Better Auth credentials email/password verification",
    method: "POST",
    url: "/api/auth/sign-in/email",
    defaultActionName: "signInEmail",
    event: "click",
    suggestedLabels: ["login", "sign in", "signin", "log in", "submit login"],
    defaultRedirect: "/",
    stepsDescription: "POST /api/auth/sign-in/email → Redirect to /",
  },
  {
    key: "auth:signUpEmail",
    label: "Sign Up with Email",
    subLabel: "Better Auth new user registration",
    method: "POST",
    url: "/api/auth/sign-up/email",
    defaultActionName: "signUpEmail",
    event: "click",
    suggestedLabels: ["register", "sign up", "signup", "create account", "get started", "join"],
    defaultRedirect: "/",
    stepsDescription: "POST /api/auth/sign-up/email → Redirect to /",
  },
  {
    key: "auth:setActiveOrg",
    label: "Set Active Organization",
    subLabel: "Better Auth switch active tenant organization context",
    method: "POST",
    url: "/api/auth/organization/set-active",
    defaultActionName: "setActiveOrganization",
    event: "click",
    suggestedLabels: ["organization", "switch org", "select org", "active org", "switch organization"],
    stepsDescription: "POST /api/auth/organization/set-active",
  },
  {
    key: "auth:leaveOrg",
    label: "Leave Organization",
    subLabel: "Better Auth leave current organization",
    method: "POST",
    url: "/api/auth/organization/leave",
    defaultActionName: "leaveOrganization",
    event: "click",
    suggestedLabels: ["leave org", "leave organization"],
    stepsDescription: "POST /api/auth/organization/leave",
  },
];

/**
 * Checks if a component/element label or name suggests a built-in auth action (e.g. "Logout" -> signOut).
 */
export function findSuggestedAuthAction(
  labelOrName?: string,
): BuiltinAuthActionOption | undefined {
  if (!labelOrName) return undefined;
  const clean = labelOrName.trim().toLowerCase();
  return BUILTIN_AUTH_ACTIONS.find((act) =>
    act.suggestedLabels.some((s) => clean === s || clean.includes(s)),
  );
}

/**
 * Creates a pre-wired UIEventItem action for a Better Auth built-in function.
 */
export function createBuiltinAuthAction(
  key: BuiltinAuthActionKey,
  redirectRoute?: string,
): UIEventItem {
  const def = BUILTIN_AUTH_ACTIONS.find((a) => a.key === key) || BUILTIN_AUTH_ACTIONS[0]!;
  const actionId = `act-auth-${def.defaultActionName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  const steps: FrontendActionStepDraft[] = [
    {
      id: `step-${now}-1`,
      order: 1,
      type: "auth",
      name: `${def.defaultActionName}`,
      authOperation:
        def.key === "auth:signOut"
          ? "signOut"
          : def.key === "auth:signInSocial"
          ? "signInSocial"
          : def.key === "auth:signInEmail"
          ? "signInEmail"
          : def.key === "auth:signUpEmail"
          ? "signUpEmail"
          : def.key === "auth:setActiveOrg"
          ? "setActiveOrg"
          : def.key === "auth:leaveOrg"
          ? "leaveOrg"
          : "signOut",
      authOutputVariable: "authResult",
    },
  ];

  const targetRedirect = redirectRoute || def.defaultRedirect;
  if (targetRedirect) {
    steps.push({
      id: `step-${now}-2`,
      order: 2,
      type: "navigation",
      name: `Redirect to ${targetRedirect}`,
      navType: "route",
      targetRoute: targetRedirect,
      navCondition: "direct",
      navMethod: "router_push",
    });
  }

  return {
    id: actionId,
    name: def.defaultActionName,
    event: def.event,
    actionType: "auth_builtin",
    url: def.url,
    method: def.method,
    description: def.subLabel,
    actionSteps: steps,
  };
}
