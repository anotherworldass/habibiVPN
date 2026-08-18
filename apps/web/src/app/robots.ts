import type { MetadataRoute } from "next";
import { siteOrigin } from "../lib/seo";

const privateSuffixes = [
  "/account",
  "/subscription",
  "/orders",
  "/checkout",
  "/payment",
  "/promo",
  "/chat",
  "/login",
  "/forgot-password",
];

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  const disallow = [
    "/api/",
    "/invite",
    "/invite/",
    ...privateSuffixes,
    ...privateSuffixes.flatMap((p) => [`/zh${p}`, `/en${p}`]),
  ];

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
