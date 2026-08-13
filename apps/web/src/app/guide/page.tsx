"use client";

import Link from "next/link";
import DocPage from "../../components/DocPage";
import { site } from "../../lib/site";

export default function GuidePage() {
  return (
    <DocPage title="使用教程" lead="从注册到连上网络，按下面三步操作即可。">
      <div className="doc-block">
        <h3>1. 注册账号</h3>
        <p>
          打开{" "}
          <Link href="/register" className="doc-a">
            注册页
          </Link>
          ，用邮箱创建 {site.brand} 账号。
        </p>
      </div>

      <div className="doc-block">
        <h3>2. 领取套餐</h3>
        <p>
          在{" "}
          <Link href="/plans" className="doc-a">
            套餐
          </Link>{" "}
          页领取免费试用，或等待管理员为你开通付费套餐。开通后会生成独立订阅链接。
        </p>
      </div>

      <div className="doc-block">
        <h3>3. 导入客户端</h3>
        <ol className="doc-list">
          <li>
            打开{" "}
            <Link href="/subscription" className="doc-a">
              连接
            </Link>
            ，如有多套餐可先切换
          </li>
          <li>点击「复制订阅链接」</li>
          <li>打开 Hiddify（或其他订阅客户端）→ 添加订阅 → 粘贴链接</li>
          <li>更新节点后选择线路连接</li>
        </ol>
      </div>

      <div className="doc-block">
        <h3>常见问题</h3>
        <ul className="doc-list">
          <li>
            <strong>续费后链接会变吗？</strong>
            <br />
            不会。同一套餐槽续费 / 改套餐会保持订阅链接不变。
          </li>
          <li>
            <strong>可以同时持有多个套餐吗？</strong>
            <br />
            可以。每个套餐对应独立上游顾客与订阅链接，在「连接」页切换查看。
          </li>
          <li>
            <strong>节点在哪里看？</strong>
            <br />
            底栏「节点」可查看地区与在线状态（列表 / 地图）。
          </li>
        </ul>
      </div>

      <Link href="/plans" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
        去领取套餐
      </Link>
    </DocPage>
  );
}
