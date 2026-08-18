import type { MetadataRoute } from "next";
import { localePath } from "../lib/locale";
import { absoluteUrl, PUBLIC_SEO_PATHS } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_SEO_PATHS.map((path) => ({
    url: absoluteUrl(localePath(path, "zh")),
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
    alternates: {
      languages: {
        "zh-CN": absoluteUrl(localePath(path, "zh")),
        en: absoluteUrl(localePath(path, "en")),
        "x-default": absoluteUrl(localePath(path, "zh")),
      },
    },
  }));
}
