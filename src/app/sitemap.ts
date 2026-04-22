import type { MetadataRoute } from "next";
import { allSlugs } from "@/lib/team-slug";

const BASE = "https://collegegolfdata.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date().toISOString().split("T")[0];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: today, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/conference-championships`, lastModified: today, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/head-to-head`, lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/regionals`, lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/championships-history`, lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/records/men`, lastModified: today, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/records/women`, lastModified: today, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/teams`, lastModified: today, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/about`, lastModified: today, changeFrequency: "monthly", priority: 0.4 },
  ];

  const teamRoutes: MetadataRoute.Sitemap = [];
  for (const gender of ["men", "women"] as const) {
    for (const slug of allSlugs(gender)) {
      teamRoutes.push({
        url: `${BASE}/teams/${gender}/${slug}`,
        lastModified: today,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [...staticRoutes, ...teamRoutes];
}
