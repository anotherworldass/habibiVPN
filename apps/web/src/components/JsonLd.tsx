import { t } from "../lib/copy";
import { localePath, type SiteLocale } from "../lib/locale";
import { absoluteUrl, siteOrigin } from "../lib/seo";
import { site } from "../lib/site";

function script(key: string, data: unknown) {
  return (
    <script
      key={key}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function JsonLd({
  locale,
  path,
}: {
  locale: SiteLocale;
  path: string;
}) {
  const origin = siteOrigin();
  const copy = t(locale);
  const nodes = [];

  nodes.push(
    script("org", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: site.brand,
      url: origin,
      email: site.supportEmail,
    }),
  );
  nodes.push(
    script("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.brand,
      url: origin,
      inLanguage: locale === "zh" ? "zh-CN" : "en",
    }),
  );

  if (path === "/guide") {
    nodes.push(
      script("faq", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: copy.guide.faqs.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      }),
    );
  }

  if (path === "/download") {
    nodes.push(
      script("app", {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: site.brand,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "iOS, Android, Windows, macOS",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        url: absoluteUrl(localePath("/download", locale)),
      }),
    );
  }

  const crumbs: Record<string, string> = {
    "/about": copy.about.title,
    "/guide": copy.guide.title,
    "/download": copy.download.title,
    "/clients": copy.clients.title,
    "/privacy": locale === "en" ? "Privacy" : "隐私条款",
    "/terms": locale === "en" ? "Terms" : "用户协议",
    "/support": copy.support.title,
    "/nodes": copy.nodes.title,
    "/plans": copy.nav.plans,
  };
  const crumbTitle = crumbs[path];
  if (crumbTitle) {
    nodes.push(
      script("crumbs", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: site.brand,
            item: absoluteUrl(localePath("/", locale)),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: crumbTitle,
            item: absoluteUrl(localePath(path, locale)),
          },
        ],
      }),
    );
  }

  return <>{nodes}</>;
}
