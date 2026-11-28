// ═══════════════════════════════════════════════════════════════
// MODULE: AuthVerifyStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  Token verification calls (`verifyAuthToken`) in HTTP endpoints & Kafka consumers
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { toVarName } from "../../../../utils";
import { PipelineRenderContext } from "../types";
import { resolveBinding } from "../sourceResolver";

/**
 * Renders an `auth_verify` pipeline step into TypeScript.
 *
 * Why:
 * - Lets Service B explicitly verify an incoming Bearer/JWT token inside either an HTTP
 *   endpoint or a Kafka consumer pipeline (where Express route middleware does not run).
 * - Delegates verification to `verifyAuthToken` in `../middleware/verifyToken`, preserving
 *   cached JWKS verification, required role enforcement, optional expiration bypass for
 *   delayed Kafka retries, and optional Redis revocation checking.
 */
export function renderAuthVerifyStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { outputVariable, inputBindings = [] } = step;
  const outVar = toVarName(outputVariable || step.name || "verifiedAuth") || "verifiedAuth";
  const declPrefix =
    step.declarationKind === "reassign" ? "" : `${step.declarationKind || "const"} `;

  // Look for explicit token binding (supports "token", "authToken", or "authorization")
  const tokenBinding =
    inputBindings.find(
      (b) =>
        b.argName === "token" ||
        b.argName === "authToken" ||
        b.argName === "authorization",
    ) || inputBindings[0];

  const isConsumerContext = ctx.bodyVar === "validatedPayload" || ctx.bodyVar === "payload";
  const defaultTokenExpr = isConsumerContext
    ? 'headers["authorization"] || headers["x-auth-token"] || ""'
    : 'req.headers["authorization"] || ""';

  const tokenExpr = tokenBinding
    ? `${resolveBinding(tokenBinding, ctx)} ?? ""`
    : defaultTokenExpr;

  const opts: string[] = [];
  if (step.authVerifyRequiredRoles && step.authVerifyRequiredRoles.length > 0) {
    opts.push(`roles: ${JSON.stringify(step.authVerifyRequiredRoles)}`);
  }
  if (step.authVerifyExpirationPolicy === "verify_signature_ignore_exp") {
    opts.push("ignoreExpiration: true");
  }

  const optsArg = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";

  return [
    `${declPrefix}${outVar} = await verifyAuthToken(String(${tokenExpr})${optsArg});`,
  ];
}
