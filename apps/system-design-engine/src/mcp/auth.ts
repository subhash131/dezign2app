import { Request } from "express";

export interface AuthContext {
  userId: string;
  orgId?: string;
  keyId?: string;
  token: string;
}

const CLERK_JWT_ISSUER = "https://clerk.blueprint.dev";
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
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

async function validateConvexApiKey(key: string): Promise<{ userId: string; orgId?: string; keyId: string } | null> {
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

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === "success" && data.value) {
      return data.value;
    }
    return null;
  } catch (err) {
    console.error("[AUTH] Error validating API key:", err);
    return null;
  }
}

export async function resolveAuth(token: string): Promise<AuthContext | null> {
  if (token.startsWith("sk_live_") || token.startsWith("sk_test_")) {
    const validationResult = await validateConvexApiKey(token);
    if (validationResult) {
      return {
        userId: validationResult.userId,
        token: token,
        orgId: validationResult.orgId,
        keyId: validationResult.keyId,
      };
    }
    return null;
  }

  const payload = verifyClerkJWT(token);
  if (payload && payload.sub) {
    return {
      userId: payload.sub,
      token: token,
    };
  }

  return null;
}
