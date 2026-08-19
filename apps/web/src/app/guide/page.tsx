"use client";

import { useMemo, useState } from "react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import Shell from "../../components/Shell";
import { t } from "../../lib/copy";

export default function GuidePage() {
  const copy = t(useLocale()).guide;
  const [query, setQuery] = useState("");
  const searchItems = useMemo(
    () => [
      {
        title: copy.start1Title,
        body: `${copy.start1After} ${copy.start1Trial}`,
        href: "#help-start",
      },
      {
        title: copy.start2Title,
        body: copy.start2After,
        href: "#help-start",
      },
      {
        title: copy.appTitle,
        body: `${copy.appBody} ${copy.appStep1} ${copy.appStep2} ${copy.appStep3}`,
        href: "#help-connect",
      },
      {
        title: copy.thirdTitle,
        body: `${copy.thirdBody} ${copy.thirdStep1} ${copy.thirdStep2}`,
        href: "#help-connect",
      },
      {
        title: copy.platformsTitle,
        body: `${copy.platIosBody} ${copy.platAndroidBody} ${copy.platWinBody} ${copy.platMacBody}`,
        href: "#help-platforms",
      },
      {
        title: copy.rulesTitle,
        body: `${copy.rule1} ${copy.rule2} ${copy.rule3}`,
        href: "#help-rules",
      },
      ...copy.faqs.map((item) => ({
        title: item.q,
        body: item.a,
        href: "#help-faq",
      })),
    ],
    [copy],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery
    ? searchItems
        .filter((item) =>
          `${item.title} ${item.body}`.toLocaleLowerCase().includes(normalizedQuery),
        )
        .slice(0, 6)
    : [];

  return (
    <Shell>
      <div className="help-center">
        <header className="help-hero">
          <div className="help-hero-inner">
            <p className="help-eyebrow">{copy.kicker}</p>
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
            <div className="help-search-wrap">
              <label className="help-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <span className="sr-only">{copy.searchAria}</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                />
              </label>
              {normalizedQuery ? (
                <div className="help-search-results" role="region" aria-live="polite">
                  {results.length ? (
                    results.map((item) => (
                      <a key={`${item.href}-${item.title}`} href={item.href} onClick={() => setQuery("")}>
                        <strong>{item.title}</strong>
                        <span>{item.body}</span>
                      </a>
                    ))
                  ) : (
                    <p>{copy.searchEmpty}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="help-main">
          <section className="help-browse" aria-labelledby="help-browse-title">
            <div className="help-section-head">
              <h2 id="help-browse-title">{copy.browseTitle}</h2>
              <p>{copy.browseLead}</p>
            </div>
            <div className="help-topic-grid">
              <a href="#help-start" className="help-topic">
                <span className="help-topic-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 3v18M3 12h18" />
                  </svg>
                </span>
                <span>
                  <strong>{copy.tocStart}</strong>
                  <small>{copy.topicStartDesc}</small>
                </span>
                <i aria-hidden>→</i>
              </a>
              <a href="#help-connect" className="help-topic">
                <span className="help-topic-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M8.5 15.5 15.5 8.5M9 7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3M14 3h7v7M13 11l8-8" />
                  </svg>
                </span>
                <span>
                  <strong>{copy.tocModes}</strong>
                  <small>{copy.topicModesDesc}</small>
                </span>
                <i aria-hidden>→</i>
              </a>
              <a href="#help-rules" className="help-topic">
                <span className="help-topic-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" />
                  </svg>
                </span>
                <span>
                  <strong>{copy.tocRules}</strong>
                  <small>{copy.topicRulesDesc}</small>
                </span>
                <i aria-hidden>→</i>
              </a>
            </div>
          </section>

          <section className="help-panel help-quick" id="help-start">
            <div className="help-panel-heading">
              <span>01</span>
              <div>
                <h2>{copy.startTitle}</h2>
                <p>{copy.topicStartDesc}</p>
              </div>
            </div>
            <ol className="help-step-grid">
              <li>
                <b>1</b>
                <div>
                  <h3>{copy.start1Title}</h3>
                  <p>
                    {copy.start1Before}{" "}
                    <Link href="/register">{copy.start1Link}</Link>
                    {copy.start1After}
                  </p>
                  <small>{copy.start1Trial}</small>
                </div>
              </li>
              <li>
                <b>2</b>
                <div>
                  <h3>{copy.start2Title}</h3>
                  <p>
                    {copy.start2Before}{" "}
                    <Link href="/plans">{copy.start2Link}</Link>
                    {copy.start2After}
                  </p>
                </div>
              </li>
              <li>
                <b>3</b>
                <div>
                  <h3>{copy.modesTitle}</h3>
                  <p>{copy.topicModesDesc}</p>
                </div>
              </li>
            </ol>
          </section>

          <section className="help-panel" id="help-connect">
            <div className="help-panel-heading">
              <span>02</span>
              <div>
                <h2>{copy.modesTitle}</h2>
                <p>{copy.topicModesDesc}</p>
              </div>
            </div>
            <div className="help-method-grid">
              <article className="help-method" data-primary="true">
                <div className="help-method-top">
                  <span>{copy.appKicker}</span>
                  <b>{copy.appBadge}</b>
                </div>
                <h3>{copy.appTitle}</h3>
                <p>{copy.appBody}</p>
                <ol>
                  <li>{copy.appStep1}</li>
                  <li>{copy.appStep2}</li>
                  <li>{copy.appStep3}</li>
                </ol>
                <Link href="/download">{copy.appCta}<span>→</span></Link>
              </article>
              <article className="help-method">
                <div className="help-method-top">
                  <span>{copy.thirdKicker}</span>
                </div>
                <h3>{copy.thirdTitle}</h3>
                <p>{copy.thirdBody}</p>
                <ol>
                  <li>{copy.thirdStep1}</li>
                  <li>{copy.thirdStep2}</li>
                  <li>{copy.thirdStep3}</li>
                  <li>{copy.thirdStep4}</li>
                </ol>
                <small>{copy.thirdNote}</small>
                <Link href="/subscription">{copy.thirdCta}<span>→</span></Link>
              </article>
            </div>
          </section>

          <section className="help-panel" id="help-platforms">
            <div className="help-panel-heading">
              <span>03</span>
              <div>
                <h2>{copy.platformsTitle}</h2>
                <p>iOS · Android · Windows · macOS</p>
              </div>
            </div>
            <div className="help-platform-grid">
              {[
                [copy.platIosTitle, copy.platIosBody],
                [copy.platAndroidTitle, copy.platAndroidBody],
                [copy.platWinTitle, copy.platWinBody],
                [copy.platMacTitle, copy.platMacBody],
              ].map(([title, body]) => (
                <article key={title}>
                  <span aria-hidden>{title.slice(0, 1)}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="help-bottom-grid">
            <section className="help-panel" id="help-rules">
              <div className="help-panel-heading">
                <span>04</span>
                <div>
                  <h2>{copy.rulesTitle}</h2>
                </div>
              </div>
              <ul className="help-rule-list">
                <li>{copy.rule1}</li>
                <li>{copy.rule2}</li>
                <li>{copy.rule3}</li>
              </ul>
            </section>

            <section className="help-panel" id="help-faq">
              <div className="help-panel-heading">
                <span>05</span>
                <div>
                  <h2>{copy.faqTitle}</h2>
                </div>
              </div>
              <div className="help-faq-list">
                {copy.faqs.map((item, index) => (
                  <details key={item.q} open={index === 0}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside className="help-contact">
            <div>
              <h2>{copy.moreTitle}</h2>
              <p>{copy.moreLead}</p>
            </div>
            <div>
              <Link href="/support" className="btn btn-primary">{copy.ctaSupport}</Link>
              <Link href="/download" className="btn btn-secondary">{copy.ctaDownload}</Link>
            </div>
          </aside>
        </main>
      </div>
    </Shell>
  );
}
