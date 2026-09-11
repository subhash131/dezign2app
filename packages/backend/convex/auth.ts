import { betterAuth, type User, type BetterAuthOptions } from "better-auth";
import {
  createClient,
  type CreateAuth,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { components, api } from "./_generated/api";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { convex } from "@convex-dev/better-auth/plugins";
import { organization, bearer } from "better-auth/plugins";
import type { GenericDataModel } from "convex/server";

import { mutation } from "./_generated/server";

export const betterAuthComponentClient = createClient<
  GenericDataModel,
  typeof authSchema
>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
});

export const cleanStaleJwks = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: "jwks",
        where: [],
      },
      paginationOpts: {
        numItems: 100,
        cursor: null,
      },
    });
    return { success: true, message: "Cleared stale JWKS" };
  },
});

export const createAuthOptions = (
  ctx: GenericCtx<GenericDataModel>,
) => {
  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  const trustedOrigins = [
    baseURL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((s) => s.trim()) || []),
    "dezign2app://",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "http://127.0.0.1",
    "http://localhost",
  ].filter(Boolean) as string[];

  const finalTrustedOrigins = Array.from(new Set(trustedOrigins));
  console.log("[convex:auth] createAuth invoked. baseURL:", baseURL, "trustedOrigins:", finalTrustedOrigins);

  return {
    appName: "Dezign2App",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: finalTrustedOrigins,
    database: betterAuthComponentClient.adapter(ctx),
    databaseHooks: {
      user: {
        create: {
          after: async (user: User) => {
            if ("runMutation" in ctx && user.email) {
              try {
                await ctx.runMutation(api.users.ensureAuthUser, {
                  email: user.email,
                  name: user.name || user.email.split("@")[0] || "User",
                  authId: user.id,
                  avatarUrl: user.image ?? undefined,
                });
              } catch (e) {
                console.error("[Auth] Error syncing user on create:", e);
              }
            }
          },
        },
        update: {
          after: async (user: User) => {
            if ("runMutation" in ctx && user.email) {
              try {
                await ctx.runMutation(api.users.ensureAuthUser, {
                  email: user.email,
                  name: user.name || user.email.split("@")[0] || "User",
                  authId: user.id,
                  avatarUrl: user.image ?? undefined,
                });
              } catch (e) {
                console.error("[Auth] Error syncing user on update:", e);
              }
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        enabled: !!(
          process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ),
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        enabled: !!(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ),
      },
    },
    plugins: [
      organization({ allowUserToCreateOrganization: true }),
      bearer(),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
        jwt: {
          definePayload: async ({ user, session }) => {
            const activeOrgId =
              "activeOrganizationId" in session &&
              typeof session.activeOrganizationId === "string"
                ? session.activeOrganizationId
                : undefined;
            return {
              aud: "convex",
              sub: user.id,
              email: user.email,
              name: user.name,
              org_id: activeOrgId,
              orgId: activeOrgId,
            };
          },
        },
      }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth: CreateAuth<GenericDataModel> = (
  ctx: GenericCtx<GenericDataModel>,
) => {
  return betterAuth(createAuthOptions(ctx));
};
