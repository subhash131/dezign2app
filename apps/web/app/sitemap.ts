import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://www.dezign2app.com");
  const lastModified = new Date();

  const publicRoutes = [
    { url: "", changeFrequency: "daily", priority: 1.0 },
    { url: "/pricing", changeFrequency: "weekly", priority: 0.9 },
    { url: "/dpm", changeFrequency: "weekly", priority: 0.9 },
    { url: "/about", changeFrequency: "monthly", priority: 0.8 },
    { url: "/docs", changeFrequency: "weekly", priority: 0.8 },
    { url: "/blog", changeFrequency: "weekly", priority: 0.7 },
    { url: "/tutorials", changeFrequency: "weekly", priority: 0.7 },
    { url: "/changelog", changeFrequency: "weekly", priority: 0.6 },
    { url: "/partners", changeFrequency: "monthly", priority: 0.5 },
    { url: "/careers", changeFrequency: "monthly", priority: 0.5 },
    { url: "/contact", changeFrequency: "monthly", priority: 0.5 },
    { url: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { url: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { url: "/acceptable-use", changeFrequency: "yearly", priority: 0.3 },
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified,
    changeFrequency: route.changeFrequency as "daily" | "weekly" | "monthly" | "yearly",
    priority: route.priority,
  }));
}
