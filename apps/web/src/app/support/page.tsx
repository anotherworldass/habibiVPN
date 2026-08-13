"use client";

import DocPage from "../../components/DocPage";
import { site } from "../../lib/site";

export default function SupportPage() {
  const mail = `mailto:${site.supportEmail}?subject=${encodeURIComponent(`${site.brand} 客服咨询`)}`;

  return (
    <DocPage title="联系客服" lead="账号、套餐、订阅链接等问题可在这里找到我们。">
      <div className="doc-block">
        <h3>在线客服</h3>
        <p>
          <a href="/chat" className="doc-a">
            打开聊天窗口
          </a>
        </p>
        <p className="doc-muted">网页或 App 内可直接对话，通常几分钟内回复。</p>
      </div>

      <div className="doc-block">
        <h3>邮箱</h3>
        <p>
          <a href={mail} className="doc-a">
            {site.supportEmail}
          </a>
        </p>
        <p className="doc-muted">一般会在 1–2 个工作日内回复。</p>
      </div>

      {site.supportTelegram ? (
        <div className="doc-block">
          <h3>Telegram</h3>
          <p>
            <a
              href={site.supportTelegram}
              className="doc-a"
              target="_blank"
              rel="noreferrer"
            >
              打开客服频道 / 机器人
            </a>
          </p>
        </div>
      ) : null}

      <div className="doc-block">
        <h3>反馈时请尽量提供</h3>
        <ul className="doc-list">
          <li>注册邮箱</li>
          <li>套餐名称或订阅状态截图</li>
          <li>问题发生时间与客户端名称（如 Hiddify）</li>
        </ul>
      </div>

      <a href={mail} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
        发送邮件
      </a>
    </DocPage>
  );
}
