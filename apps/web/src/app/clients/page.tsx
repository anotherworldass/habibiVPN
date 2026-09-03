"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { platformIcons } from "../../components/PlatformIcons";
import Shell from "../../components/Shell";
import { t } from "../../lib/copy";
import {
  detectThirdPartyPlatform,
  fetchThirdPartyClients,
  platformsForClients,
  type ThirdPartyChannel,
  type ThirdPartyClient,
  type ThirdPartyPlatform,
} from "../../lib/third-party-clients";

const PLATFORM_LABEL: Record<ThirdPartyPlatform, string> = {
  ios: "iOS",
  android: "Android",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

function linuxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c1.4 0 2.6 1.4 2.8 3.3.2 1.4-.2 2.9-1 4.1l.2.1c1.7.8 2.8 2.3 3.1 4.1.4 2.2-.3 4.2-1.8 5.4-.7.6-1.2 1.4-1.3 2.3 0 .6-.5 1.1-1.1 1.1H10.1c-.6 0-1.1-.5-1.1-1.1-.1-.9-.6-1.7-1.3-2.3-1.5-1.2-2.2-3.2-1.8-5.4.3-1.8 1.4-3.3 3.1-4.1l.2-.1c-.8-1.2-1.2-2.7-1-4.1C9.4 3.4 10.6 2 12 2Zm-1.7 14.6c.4.3.6.8.6 1.3h2.2c0-.5.2-1 .6-1.3.9-.6 1.5-1.6 1.6-2.7.1-1.3-.4-2.4-1.4-3.1-.4-.3-.6-.8-.6-1.2 0-.3.1-.6.3-.8.4-.4.6-1 .5-1.6C14 6.2 13.1 5.3 12 5.3S10 6.2 9.9 7.2c-.1.6.1 1.2.5 1.6.2.2.3.5.3.8 0 .4-.2.9-.6 1.2-1 .7-1.5 1.8-1.4 3.1.1 1.1.7 2.1 1.6 2.7Z" />
    </svg>
  );
}

function platformIcon(platform: ThirdPartyPlatform) {
  if (platform === "linux") return linuxIcon();
  return platformIcons[platform];
}

function channelCta(
  channel: ThirdPartyChannel,
  copy: ReturnType<typeof t>["clients"],
) {
  if (channel === "app_store") return copy.ctaAppStore;
  if (channel === "play") return copy.ctaPlay;
  if (channel === "github") return copy.ctaGithub;
  return copy.ctaWebsite;
}

export default function ClientsPage() {
  const locale = useLocale();
  const copy = t(locale).clients;
  const [items, setItems] = useState<ThirdPartyClient[]>([]);
  const [platform, setPlatform] = useState<ThirdPartyPlatform | null>(null);
  const [openTip, setOpenTip] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("platform")?.trim().toLowerCase();
    const detected = detectThirdPartyPlatform();
    if (
      fromQuery === "ios" ||
      fromQuery === "android" ||
      fromQuery === "windows" ||
      fromQuery === "macos" ||
      fromQuery === "linux"
    ) {
      setPlatform(fromQuery);
    } else {
      setPlatform(detected);
    }
    void fetchThirdPartyClients()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);

  const available = useMemo(() => platformsForClients(items), [items]);
  const active =
    platform && available.includes(platform) ? platform : available[0] ?? "android";

  const visible = useMemo(
    () => items.filter((item) => item.urls[active]),
    [active, items],
  );

  return (
    <Shell>
      <div className="clients-page">
        <div className="page-head">
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
        <p className="clients-disclaimer">{copy.disclaimer}</p>

        {available.length > 1 ? (
          <div className="clients-platform-bar" role="tablist" aria-label={copy.platformAria}>
            {available.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active === id}
                className="clients-platform-chip"
                data-active={active === id}
                onClick={() => setPlatform(id)}
              >
                <span className="clients-platform-chip-icon" aria-hidden>
                  {platformIcon(id)}
                </span>
                {PLATFORM_LABEL[id]}
              </button>
            ))}
          </div>
        ) : null}

        {!loaded ? null : visible.length ? (
          <div className="clients-grid">
            {visible.map((item) => {
              const download = item.urls[active];
              if (!download) return null;
              const tipOpen = openTip === item.id;
              return (
                <article key={item.id} className="clients-card">
                  <div className="clients-card-top">
                    <div className="clients-card-mark" aria-hidden>
                      {item.name.slice(0, 1)}
                    </div>
                    <div className="clients-card-copy">
                      <h2>{item.name}</h2>
                      {item.summary ? <p>{item.summary}</p> : null}
                    </div>
                  </div>
                  <div className="clients-card-tags">
                    {item.featured ? <span>{copy.featured}</span> : null}
                    <span>{item.paid ? copy.paid : copy.free}</span>
                  </div>
                  <a
                    className="btn btn-primary clients-card-cta"
                    href={download.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {channelCta(download.channel, copy)}
                  </a>
                  {item.tip ? (
                    <div className="clients-card-tip">
                      <button
                        type="button"
                        className="clients-tip-toggle"
                        aria-expanded={tipOpen}
                        onClick={() =>
                          setOpenTip(tipOpen ? null : item.id)
                        }
                      >
                        {tipOpen ? copy.tipHide : copy.tipShow}
                      </button>
                      {tipOpen ? <p>{item.tip}</p> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="clients-empty">{copy.empty}</p>
        )}

        <p className="download-web-hint">
          <Link href="/download">{copy.officialApp}</Link>
          {" · "}
          <Link href="/subscription">{copy.connect}</Link>
        </p>
      </div>
    </Shell>
  );
}
