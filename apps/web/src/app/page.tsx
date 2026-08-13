"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HelpLinks from "../components/HelpLinks";
import Shell from "../components/Shell";
import { getToken } from "../lib/auth";
import { site } from "../lib/site";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setReady(true);
  }, []);

  return (
    <Shell flush>
      <section className="hero">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="hero-brand">{site.brand}</p>
            <h1 className="hero-title">{site.slogan}</h1>
            <p className="hero-lead">
              {loggedIn
                ? "打开连接复制订阅链接，或前往套餐续费与升级。"
                : "注册领取套餐，复制订阅链接，导入客户端即可使用。"}
            </p>
            <div className="hero-cta">
              {!ready ? null : loggedIn ? (
                <>
                  <Link href="/subscription" className="btn btn-primary">
                    打开连接
                  </Link>
                  <Link href="/plans" className="btn btn-secondary">
                    查看套餐
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/register" className="btn btn-primary">
                    开始使用
                  </Link>
                  <Link href="/login" className="btn btn-secondary">
                    已有账号
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="habibi-pad">
        <section className="section">
          <h2 className="section-title">三步连上快速虚拟网络</h2>
          <p className="section-lead">从注册到导入客户端，全程不到一分钟。</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div>
                <h3>注册账号</h3>
                <p>用邮箱创建 {site.brand} 账号。</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div>
                <h3>领取套餐</h3>
                <p>免费试用可一键领取，自动开通上游订阅。</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <h3>导入客户端</h3>
                <p>复制订阅链接，粘贴到 Hiddify 等客户端。</p>
              </div>
            </div>
          </div>
        </section>
        <HelpLinks />
      </div>
    </Shell>
  );
}
