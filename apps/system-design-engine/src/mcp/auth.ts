import { Request } from "express";

export interface AuthContext {
  userId: string;
  orgId?: string;
  keyId?: string;
  projectId?: string;
  token: string;
}

const CONVEX_URL = process.env.CONVEX_URL || "";

function verifyClerkJWT(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[AUTH] Invalid JWT format");
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString());

    console.log("[AUTH] JWT verified successfully, user:", payload.sub);
    return payload;
  } catch (err) {
    console.error("[AUTH] Error parsing JWT:", err);
    return null;
  }
}

export function extractAuthToken(req: Request): string | null {
  const rawHeader = req.headers.authorization;
  console.log(`[AUTH] Authorization header present: ${!!rawHeader}`);

  if (!rawHeader) {
    console.warn("[AUTH] No Authorization header found in request");
    return null;
  }

  if (!rawHeader.startsWith("Bearer ")) {
    console.warn(`[AUTH] Authorization header does not start with 'Bearer '. Got: "${rawHeader.substring(0, 20)}..."`);
    return null;
  }

  const token = rawHeader.substring(7).trim();
  const preview = token.substring(0, 16) + "...";
  console.log(`[AUTH] Extracted token: "${preview}" (length=${token.length})`);
  return token;
}

async function validateConvexApiKey(
  key: string,
): Promise<{ userId: string; orgId?: string; keyId: string; projectId?: string } | null> {
  const preview = key.substring(0, 16) + "...";
  console.log(`[AUTH] Validating API key: "${preview}" against Convex at ${CONVEX_URL}`);
  console.log(`[AUTH] Key starts with sk_live_: ${key.startsWith("sk_live_")}`);

  if (!CONVEX_URL) {
    console.error("[AUTH] CONVEX_URL is not set — cannot validate API key");
    return null;
  }

  try {
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "api_keys:validate",
        args: { key },
        format: "json",
      }),
    });

    console.log(`[AUTH] Convex response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[AUTH] Convex query failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[AUTH] Convex response status field: "${data.status}"`);
    console.log(`[AUTH] Convex response value:`, JSON.stringify(data.value));

    if (data.status === "success" && data.value) {
      console.log(`[AUTH] API key valid — userId=${data.value.userId}, projectId=${data.value.projectId ?? "NONE"}, keyId=${data.value.keyId}`);
      return data.value;
    }

    console.warn("[AUTH] API key not found in Convex (value was null/undefined)");
    return null;
  } catch (err) {
    console.error("[AUTH] Error validating API key:", err);
    return null;
  }
}

export async function resolveAuth(token: string): Promise<AuthContext | null> {
  console.log(`[AUTH] resolveAuth called — token type: ${
    token.startsWith("sk_live_") ? "sk_live API key" :
    token.startsWith("sk_test_") ? "sk_test API key" :
    token.includes(".") ? "JWT" : "unknown"
  }`);

  if (token.startsWith("sk_live_") || token.startsWith("sk_test_")) {
    const validationResult = await validateConvexApiKey(token);
    if (validationResult) {
      console.log(`[AUTH] Resolved API key auth — user=${validationResult.userId}, project=${validationResult.projectId ?? "NONE"}`);
      return {
        userId: validationResult.userId,
        token: token,
        orgId: validationResult.orgId,
        keyId: validationResult.keyId,
        projectId: validationResult.projectId,
      };
    }
    console.warn("[AUTH] API key validation failed — returning null");
    return null;
  }

  const payload = verifyClerkJWT(token);
  if (payload && payload.sub) {
    console.log(`[AUTH] Resolved JWT auth — user=${payload.sub} (no projectId from JWT)`);
    return {
      userId: payload.sub,
      token: token,
    };
  }

  console.warn("[AUTH] Could not resolve auth from token");
  return null;
}
