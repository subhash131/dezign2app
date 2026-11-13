import type { FrontendActionStepDraft } from "@workspace/canvas";
import { toVarName } from "../../../../utils";
import {
  resolveFieldSourceExpression,
  SourceResolutionContext,
} from "./transformerStepResolver";

export interface PartitionedAuthSteps {
  preAuthSteps: FrontendActionStepDraft[];
  postAuthSteps: FrontendActionStepDraft[];
}

export function filterAuthSteps(
  actionSteps?: FrontendActionStepDraft[],
): FrontendActionStepDraft[] {
  if (!Array.isArray(actionSteps)) return [];
  return actionSteps.filter((s) => s.type === "auth");
}

export function partitionAuthSteps(
  actionSteps?: FrontendActionStepDraft[],
  hasApiUrl?: boolean,
): PartitionedAuthSteps {
  if (!Array.isArray(actionSteps)) {
    return { preAuthSteps: [], postAuthSteps: [] };
  }

  const authSteps = filterAuthSteps(actionSteps);
  if (authSteps.length === 0) {
    return { preAuthSteps: [], postAuthSteps: [] };
  }

  const apiStep = actionSteps.find((s) => s.type === "api_call");

  if (apiStep) {
    const apiOrder = apiStep.order;
    return {
      preAuthSteps: authSteps.filter((s) => s.order < apiOrder),
      postAuthSteps: authSteps.filter((s) => s.order >= apiOrder),
    };
  }

  if (hasApiUrl) {
    const preAuthSteps: FrontendActionStepDraft[] = [];
    const postAuthSteps: FrontendActionStepDraft[] = [];

    for (const step of authSteps) {
      if (step.order > 1) {
        postAuthSteps.push(step);
      } else {
        preAuthSteps.push(step);
      }
    }
    return { preAuthSteps, postAuthSteps };
  }

  return {
    preAuthSteps: authSteps,
    postAuthSteps: [],
  };
}

export function resolveAuthImports(actionSteps?: FrontendActionStepDraft[]): {
  hasAuthStep: boolean;
  importStatement: string;
} {
  const authSteps = filterAuthSteps(actionSteps);
  if (authSteps.length === 0) {
    return { hasAuthStep: false, importStatement: "" };
  }
  return {
    hasAuthStep: true,
    importStatement: `import { authClient } from "@/lib/auth-client";\n`,
  };
}

export function resolveAuthStepRequirements(steps: FrontendActionStepDraft[]): {
  storeNames: string[];
  needsUseParams: boolean;
  needsUseSearchParams: boolean;
} {
  const storeNames = new Set<string>();
  let needsUseParams = false;
  let needsUseSearchParams = false;

  for (const step of steps) {
    const sources = [
      step.authEmailSource,
      step.authPasswordSource,
      step.authNameSource,
      step.authOrgIdSource,
    ].filter(Boolean);

    for (const src of sources) {
      if (!src) continue;
      if (src.kind === "state_var" && src.storeName) {
        storeNames.add(src.storeName.replace(/Store$/i, ""));
      } else if (src.kind === "route_param") {
        needsUseParams = true;
      } else if (src.kind === "query_param") {
        needsUseSearchParams = true;
      }
    }
  }

  return {
    storeNames: Array.from(storeNames),
    needsUseParams,
    needsUseSearchParams,
  };
}

export interface AuthStepRenderContext {
  hasTriggerResult?: boolean;
  payloadVar?: string;
  resDataVar?: string;
  indent?: string;
}

export function renderAuthStep(
  step: FrontendActionStepDraft,
  stepOutputMap: Map<string, string>,
  ctx: AuthStepRenderContext,
  indent: string = "      ",
): string {
  const op = step.authOperation || "signOut";
  const outputVar = toVarName(step.authOutputVariable?.trim() || "authResult");

  stepOutputMap.set(step.id, outputVar);
  if (step.name) stepOutputMap.set(step.name, outputVar);
  stepOutputMap.set("auth", outputVar);
  stepOutputMap.set("authResult", outputVar);

  const fullCtx: SourceResolutionContext = {
    stepOutputMap,
    hasTriggerResult: ctx.hasTriggerResult,
    payloadVar: ctx.payloadVar,
    resDataVar: ctx.resDataVar,
  };

  switch (op) {
    case "signOut": {
      return `${indent}await authClient.signOut();\n`;
    }
    case "signInSocial": {
      const provider = step.authProvider || "google";
      const cb = step.authCallbackUrl ? `, callbackURL: ${JSON.stringify(step.authCallbackUrl)}` : "";
      return `${indent}await authClient.signIn.social({ provider: "${provider}"${cb} });\n`;
    }
    case "signInEmail": {
      const emailExpr = step.authEmailSource
        ? resolveFieldSourceExpression(step.authEmailSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["email"] || ""`;
      const passExpr = step.authPasswordSource
        ? resolveFieldSourceExpression(step.authPasswordSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["password"] || ""`;
      const cb = step.authCallbackUrl ? `, callbackURL: ${JSON.stringify(step.authCallbackUrl)}` : "";
      return `${indent}const ${outputVar} = await authClient.signIn.email({ email: String(${emailExpr}), password: String(${passExpr})${cb} });\n`;
    }
    case "signUpEmail": {
      const emailExpr = step.authEmailSource
        ? resolveFieldSourceExpression(step.authEmailSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["email"] || ""`;
      const passExpr = step.authPasswordSource
        ? resolveFieldSourceExpression(step.authPasswordSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["password"] || ""`;
      const nameExpr = step.authNameSource
        ? resolveFieldSourceExpression(step.authNameSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["name"] || ""`;
      const cb = step.authCallbackUrl ? `, callbackURL: ${JSON.stringify(step.authCallbackUrl)}` : "";
      return `${indent}const ${outputVar} = await authClient.signUp.email({ email: String(${emailExpr}), password: String(${passExpr}), name: String(${nameExpr})${cb} });\n`;
    }
    case "setActiveOrg": {
      const orgExpr = step.authOrgIdSource
        ? resolveFieldSourceExpression(step.authOrgIdSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["organizationId"] || ""`;
      return `${indent}await authClient.organization.setActive({ organizationId: String(${orgExpr}) });\n`;
    }
    case "leaveOrg": {
      const orgExpr = step.authOrgIdSource
        ? resolveFieldSourceExpression(step.authOrgIdSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["organizationId"] || ""`;
      return `${indent}await authClient.organization.leave({ organizationId: String(${orgExpr}) });\n`;
    }
    case "getSession": {
      return `${indent}const ${outputVar} = await authClient.getSession();\n`;
    }
    default:
      return `${indent}await authClient.signOut();\n`;
  }
}

export function renderAuthStepList(
  steps: FrontendActionStepDraft[],
  stepOutputMap: Map<string, string>,
  ctx: AuthStepRenderContext,
  indent: string = "      ",
): string {
  return steps.map((s) => renderAuthStep(s, stepOutputMap, ctx, indent)).join("");
}

