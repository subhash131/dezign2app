import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://www.dezign2app.com");

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/docs",
          "/blog",
          "/about",
          "/privacy",
          "/terms",
          "/terms-and-conditions",
          "/acceptable-use",
          "/aup",
          "/tutorials",
          "/support",
          "/careers",
          "/contact",
          "/partners",
          "/changelog",
          "/integrations",
          "/llms.txt",
          "/llms-full.txt",
        ],
        disallow: [
          "/api/",
          "/project/",
          "/projects",
          "/document/",
          "/dashboard/",
          "/workflows/",
          "/sign-in/",
          "/sign-up/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
