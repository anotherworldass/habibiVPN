"use client";

import Link from "next/link";
import DocPage from "../../components/DocPage";
import { site } from "../../lib/site";

export default function AboutPage() {
  return (
    <DocPage title="关于我们" lead={`${site.brand} —— 简洁可靠的个人 VPN 服务。`}>
      <div className="doc-block">
        <h3>我们是谁</h3>
        <p>
          {site.brand}{" "}
          面向需要稳定跨境访问的用户，提供注册、套餐领取、订阅管理与节点概览等一站式体验。
        </p>
      </div>

      <div className="doc-block">
        <h3>我们提供什么</h3>
        <ul className="doc-list">
          <li>多地区节点池，可在 App 内查看状态与数量</li>
          <li>一用户多套餐：每个套餐独立订阅链接</li>
          <li>续费 / 改套餐时订阅链接保持不变</li>
          <li>兼容 Hiddify 等主流订阅客户端</li>
        </ul>
      </div>

      <div className="doc-block">
        <h3>隐私说明</h3>
        <p className="doc-muted">
          我们仅在提供服务所必需的范围内处理账号与订阅信息。请勿将订阅链接分享给他人，以免账号被滥用。完整说明见{" "}
          <Link href="/privacy" className="doc-a">
            隐私条款
          </Link>
          ，使用服务前请同时阅读{" "}
          <Link href="/terms" className="doc-a">
            用户协议
          </Link>
          。
        </p>
      </div>

      <div className="doc-block">
        <h3>更多</h3>
        <p>
          使用问题请查看{" "}
          <Link href="/guide" className="doc-a">
            使用教程
          </Link>
          ，或前往{" "}
          <Link href="/support" className="doc-a">
            联系客服
          </Link>
          。
        </p>
      </div>
    </DocPage>
  );
}
