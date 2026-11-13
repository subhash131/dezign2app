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
  needsToast: boolean;
} {
  const authSteps = filterAuthSteps(actionSteps);
  if (authSteps.length === 0) {
    return { hasAuthStep: false, importStatement: "", needsToast: false };
  }

  const hasToast = authSteps.some((step) => {
    const successToast =
      step.enableOnSuccess &&
      step.onSuccessSteps?.some(
        (s) => s.type === "notification" && (!s.notifyType || s.notifyType === "toast"),
      );
    const errorToast =
      step.enableOnError &&
      step.onErrorSteps?.some(
        (s) => s.type === "notification" && (!s.notifyType || s.notifyType === "toast"),
      );
    return Boolean(successToast || errorToast);
  });

  let importStatement = `import { authClient } from "@/lib/auth-client";\n`;
  if (hasToast) {
    importStatement += `import { toast } from "sonner";\n`;
  }

  return {
    hasAuthStep: true,
    importStatement,
    needsToast: hasToast,
  };
}

export function resolveAuthStepRequirements(steps: FrontendActionStepDraft[]): {
  storeNames: string[];
  needsUseParams: boolean;
  needsUseSearchParams: boolean;
  needsUseRouter: boolean;
  needsToast: boolean;
} {
  const storeNames = new Set<string>();
  let needsUseParams = false;
  let needsUseSearchParams = false;
  let needsUseRouter = false;
  let needsToast = false;

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

    const childSteps = [
      ...(step.enableOnSuccess ? step.onSuccessSteps || [] : []),
      ...(step.enableOnError ? step.onErrorSteps || [] : []),
    ];

    for (const child of childSteps) {
      if (child.type === "navigation") {
        needsUseRouter = true;
      }
      if (child.type === "notification" && (!child.notifyType || child.notifyType === "toast")) {
        needsToast = true;
      }
    }
  }

  return {
    storeNames: Array.from(storeNames),
    needsUseParams,
    needsUseSearchParams,
    needsUseRouter,
    needsToast,
  };
}

export interface AuthStepRenderContext {
  hasTriggerResult?: boolean;
  payloadVar?: string;
  resDataVar?: string;
  indent?: string;
}

export function renderChildActionStep(
  child: FrontendActionStepDraft,
  stepOutputMap: Map<string, string>,
  ctx: SourceResolutionContext,
  indent: string,
  parentOutputVar: string,
  isErrorBranch: boolean,
): string {
  switch (child.type) {
    case "navigation": {
      const target = child.targetRoute || "/";
      const method = child.navMethod || "router_push";
      const bindings = child.pathParamBindings || [];

      if (bindings.length > 0) {
        let pathTemplate = target;
        bindings.forEach((b) => {
          const src = b.source;
          let val = `params?.["${b.paramName}"] || ""`;
          if (src?.kind === "literal") val = JSON.stringify(src.value || "");
          else if (src?.kind === "prev_response") val = `${parentOutputVar}?.${src.fieldPath || "id"}`;
          else if (src) val = resolveFieldSourceExpression(src, ctx);
          pathTemplate = pathTemplate.replace(
            new RegExp(`\\[${b.paramName}\\]`, "g"),
            `\${${val}}`,
          );
        });

        if (method === "router_replace") {
          return `${indent}router.replace(\`${pathTemplate}\`);\n`;
        }
        return `${indent}router.push(\`${pathTemplate}\`);\n`;
      }

      if (method === "router_replace") {
        return `${indent}router.replace("${target}");\n`;
      }
      return `${indent}router.push("${target}");\n`;
    }

    case "notification": {
      const isAlert = child.notifyType === "alert";
      const lvl = child.notifyLevel || (isErrorBranch ? "error" : "success");
      const rawMsg = child.notifyMessage?.trim() || "";

      let expr: string;
      if (rawMsg) {
        if (rawMsg.includes("error") || rawMsg.includes("authResult")) {
          const replaced = rawMsg.replace(/\bauthResult\b/g, parentOutputVar);
          expr = `String(${replaced})`;
        } else {
          expr = JSON.stringify(rawMsg);
        }
      } else if (isErrorBranch) {
        expr = `String(${parentOutputVar}?.error?.message || "Operation failed")`;
      } else {
        expr = JSON.stringify("Operation completed successfully");
      }

      if (isAlert) {
        return `${indent}if (typeof window !== "undefined") window.alert(${expr});\n`;
      }
      return `${indent}toast.${lvl}(${expr});\n`;
    }

    case "reset_form": {
      return `${indent}if (typeof document !== "undefined") {\n${indent}  (document.querySelector("form") as HTMLFormElement)?.reset?.();\n${indent}}\n`;
    }

    case "browser_storage": {
      const engine = child.storageEngine || "localStorage";
      const op = child.storageOperation || "set";
      const key = child.storageKey || "key";
      if (op === "clear") {
        return `${indent}if (typeof window !== "undefined") window.${engine}.clear();\n`;
      }
      if (op === "remove") {
        return `${indent}if (typeof window !== "undefined") window.${engine}.removeItem("${key}");\n`;
      }
      const valExpr = child.storageValueSource
        ? resolveFieldSourceExpression(child.storageValueSource, ctx)
        : JSON.stringify(parentOutputVar);
      return `${indent}if (typeof window !== "undefined") window.${engine}.setItem("${key}", typeof ${valExpr} === "string" ? ${valExpr} : JSON.stringify(${valExpr}));\n`;
    }

    case "custom_code": {
      const code = child.code?.trim() || "";
      if (!code) return "";
      return code.split("\n").map((line) => `${indent}${line}`).join("\n") + "\n";
    }

    default:
      return "";
  }
}

export function renderChildActionStepList(
  steps: FrontendActionStepDraft[],
  stepOutputMap: Map<string, string>,
  ctx: SourceResolutionContext,
  indent: string,
  parentOutputVar: string,
  isErrorBranch: boolean,
): string {
  return steps
    .map((s) => renderChildActionStep(s, stepOutputMap, ctx, indent, parentOutputVar, isErrorBranch))
    .join("");
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

  const hasOutcomes = Boolean(
    (step.enableOnError && step.onErrorSteps && step.onErrorSteps.length > 0) ||
    (step.enableOnSuccess && step.onSuccessSteps && step.onSuccessSteps.length > 0),
  );

  let callStatement = "";

  switch (op) {
    case "signOut": {
      if (hasOutcomes) {
        callStatement = `${indent}const ${outputVar} = await authClient.signOut();\n`;
      } else {
        callStatement = `${indent}await authClient.signOut();\n`;
      }
      break;
    }
    case "signInSocial": {
      const provider = step.authProvider || "google";
      const cb = step.authCallbackUrl ? `, callbackURL: ${JSON.stringify(step.authCallbackUrl)}` : "";
      if (hasOutcomes) {
        callStatement = `${indent}const ${outputVar} = await authClient.signIn.social({ provider: "${provider}"${cb} });\n`;
      } else {
        callStatement = `${indent}await authClient.signIn.social({ provider: "${provider}"${cb} });\n`;
      }
      break;
    }
    case "signInEmail": {
      const emailExpr = step.authEmailSource
        ? resolveFieldSourceExpression(step.authEmailSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["email"] || ""`;
      const passExpr = step.authPasswordSource
        ? resolveFieldSourceExpression(step.authPasswordSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["password"] || ""`;
      const cb = step.authCallbackUrl ? `, callbackURL: ${JSON.stringify(step.authCallbackUrl)}` : "";
      callStatement = `${indent}const ${outputVar} = await authClient.signIn.email({ email: String(${emailExpr}), password: String(${passExpr})${cb} });\n`;
      break;
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
      callStatement = `${indent}const ${outputVar} = await authClient.signUp.email({ email: String(${emailExpr}), password: String(${passExpr}), name: String(${nameExpr})${cb} });\n`;
      break;
    }
    case "setActiveOrg": {
      const orgExpr = step.authOrgIdSource
        ? resolveFieldSourceExpression(step.authOrgIdSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["organizationId"] || ""`;
      if (hasOutcomes) {
        callStatement = `${indent}const ${outputVar} = await authClient.organization.setActive({ organizationId: String(${orgExpr}) });\n`;
      } else {
        callStatement = `${indent}await authClient.organization.setActive({ organizationId: String(${orgExpr}) });\n`;
      }
      break;
    }
    case "leaveOrg": {
      const orgExpr = step.authOrgIdSource
        ? resolveFieldSourceExpression(step.authOrgIdSource, fullCtx)
        : `${ctx.payloadVar || "bodyFields"}?.["organizationId"] || ""`;
      if (hasOutcomes) {
        callStatement = `${indent}const ${outputVar} = await authClient.organization.leave({ organizationId: String(${orgExpr}) });\n`;
      } else {
        callStatement = `${indent}await authClient.organization.leave({ organizationId: String(${orgExpr}) });\n`;
      }
      break;
    }
    case "getSession": {
      callStatement = `${indent}const ${outputVar} = await authClient.getSession();\n`;
      break;
    }
    default:
      if (hasOutcomes) {
        callStatement = `${indent}const ${outputVar} = await authClient.signOut();\n`;
      } else {
        callStatement = `${indent}await authClient.signOut();\n`;
      }
  }

  let branchCode = "";
  const hasErrorBranch = Boolean(step.enableOnError && step.onErrorSteps && step.onErrorSteps.length > 0);
  const hasSuccessBranch = Boolean(step.enableOnSuccess && step.onSuccessSteps && step.onSuccessSteps.length > 0);

  if (hasErrorBranch || hasSuccessBranch) {
    if (hasErrorBranch) {
      const errorChildCode = renderChildActionStepList(
        step.onErrorSteps || [],
        stepOutputMap,
        fullCtx,
        `${indent}  `,
        outputVar,
        true,
      );
      branchCode += `${indent}if (${outputVar}?.error) {\n${errorChildCode}${indent}  return;\n${indent}}\n`;
    }

    if (hasSuccessBranch) {
      const successChildCode = renderChildActionStepList(
        step.onSuccessSteps || [],
        stepOutputMap,
        fullCtx,
        `${indent}  `,
        outputVar,
        false,
      );
      if (hasErrorBranch) {
        branchCode += `${indent}else {\n${successChildCode}${indent}}\n`;
      } else {
        branchCode += `${indent}if (!${outputVar}?.error) {\n${successChildCode}${indent}}\n`;
      }
    }
  }

  return `${callStatement}${branchCode}`;
}

export function renderAuthStepList(
  steps: FrontendActionStepDraft[],
  stepOutputMap: Map<string, string>,
  ctx: AuthStepRenderContext,
  indent: string = "      ",
): string {
  return steps.map((s) => renderAuthStep(s, stepOutputMap, ctx, indent)).join("");
}

