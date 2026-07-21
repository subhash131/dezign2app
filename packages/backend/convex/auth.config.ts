import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Replace with your own Clerk Issuer URL from your "convex" JWT template
      // or with `process.env.CLERK_ISSUER_URL`
      // and configure CLERK_ISSUER_URL on the Convex Dashboard
      // See https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances
      domain: process.env.CLERK_ISSUER_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
