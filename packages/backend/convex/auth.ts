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
    advanced: {
      database: {
        generateId: false,
      },
    },
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
      organization({
        allowUserToCreateOrganization: true,
        requireEmailVerificationOnInvitation: false,
        async sendInvitationEmail(data, _request) {
          const inviteUrl = `${baseURL}/accept-invitation/${data.id}`;
          const resendApiKey = process.env.RESEND_API_KEY;
          const resendApiUrl =
            process.env.RESEND_API_URL || "https://api.resend.com/emails";
          const fromEmail =
            process.env.EMAIL_FROM || "Dezign2App <onboarding@resend.dev>";

          if (resendApiKey) {
            try {
              const res = await fetch(resendApiUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resendApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: fromEmail,
                  to: [data.email],
                  subject: `Invitation to join ${data.organization.name} on Dezign2App`,
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #111;">
                      <div style="margin-bottom: 24px;">
                        <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #000;">Team Invitation</h2>
                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0;">
                          You have been invited by <strong>${data.inviter.user.name || data.inviter.user.email}</strong> to join <strong>${data.organization.name}</strong> on Dezign2App as <strong>${data.role}</strong>.
                        </p>
                      </div>

                      <div style="margin: 28px 0;">
                        <a href="${inviteUrl}" style="background-color: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
                          Accept Invitation & Join Team
                        </a>
                      </div>

                      <p style="font-size: 12px; line-height: 1.5; color: #777; margin: 24px 0 0 0;">
                        If the button above doesn't work, copy and paste this link into your browser:<br />
                        <a href="${inviteUrl}" style="color: #0066cc; word-break: break-all;">${inviteUrl}</a>
                      </p>

                      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 32px 0 16px 0;" />
                      <p style="font-size: 11px; color: #999; margin: 0;">
                        This invitation was intended for ${data.email}. If you were not expecting this invitation, you can ignore this email.
                      </p>
                    </div>
                  `,
                }),
              });
              if (!res.ok) {
                const errorText = await res.text();
                console.error("[Auth] Resend invite email error:", errorText);
              }
              return;
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Failed to send invite email";
              console.error(
                "[Auth] Error sending invite email via Resend:",
                message,
              );
            }
          }

          console.log(
            `\n========================================\n[AUTH DEV] Org invitation for ${data.email} to ${data.organization.name}:\n${inviteUrl}\n========================================\n`,
          );
        },
      }),
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
