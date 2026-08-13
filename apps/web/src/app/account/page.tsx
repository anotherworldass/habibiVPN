"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import HelpLinks from "../../components/HelpLinks";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { clearToken, getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";

type Me = {
  id: string;
  uid?: number;
  email?: string | null;
  subscription_count?: number;
  has_subscription?: boolean;
};

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    apiFetch<{ user: Me }>("/api/v1/me")
      .then((res) => setMe(res.user))
      .catch((e) => setError(friendlyError(e, "加载失败")))
      .finally(() => setReady(true));
  }, [router]);

  const uidText = ready ? (me?.uid != null ? String(me.uid) : "—") : "…";
  const emailText = ready ? me?.email || "—" : "加载中…";
  const planCount = ready ? me?.subscription_count ?? 0 : null;

  return (
    <Shell>
      <div className="account-page">
        <div className="page-head account-page-head">
          <div>
            <h1>我的</h1>
            <p className="account-page-lead-mobile">账号、推广与帮助。</p>
          </div>
          <p className="account-page-lead-desktop">
            账号信息与常用入口，推广与帮助随时可进。
          </p>
        </div>

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="account-desktop">
          <section className="account-identity" aria-label="账号信息">
            <div className="account-identity-copy">
              <span className="account-eyebrow">用户 UID</span>
              <div className="account-uid-value">{uidText}</div>
              <div className="account-email">{emailText}</div>
            </div>

            <Link href="/subscription" className="account-plan-chip">
              <strong>{planCount == null ? "…" : planCount}</strong>
              <span>套餐</span>
            </Link>

            <div className="account-identity-actions">
              <Link href="/subscription" className="btn btn-primary">
                打开连接
              </Link>
              <Link href="/plans" className="btn btn-secondary">
                套餐中心
              </Link>
            </div>
          </section>

          <div className="account-desktop-body">
            <div className="account-desktop-main">
              <div className="account-link-stack">
                <Link href="/promo" className="account-promo-card account-promo-card--featured">
                  <span className="account-promo-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 12h16M12 4v16" />
                      <path d="M6.5 6.5h11v11h-11z" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-kicker">推荐</div>
                    <div className="promo-entry-title">推广中心</div>
                    <div className="promo-entry-desc">
                      邀请好友充值，可持续获得佣金，多达 5 层分成
                    </div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>

                <Link href="/orders" className="account-nav-card">
                  <span className="account-nav-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z" />
                      <path d="M9 9h6M9 13h4" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-title">购买记录</div>
                    <div className="promo-entry-desc">查看已成功开通的历史订单</div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </div>

              <button
                type="button"
                className="account-logout"
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
              >
                <span className="account-logout-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                    <path d="m15 8 4 4-4 4M9 12h10" />
                  </svg>
                </span>
                <span>退出登录</span>
              </button>
            </div>

            <aside className="account-desktop-aside">
              <HelpLinks title="帮助与支持" />
            </aside>
          </div>
        </div>
      </div>
    </Shell>
  );
}
