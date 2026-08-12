# @habibi/tg — Telegram Mini App

TiTiVPN 的 Telegram 小程序前端。与 `apps/web` 并列，**独立壳层 / 导航**，业务复用同一套 `apps/api`。

## 本地开发

一键启动（含 API / Admin / H5 / TG）：

```bash
pnpm dev
# 或: bash scripts/dev-local.sh
```

仅启动 TG（需 API 已在跑）：

```bash
pnpm dev:tg   # http://127.0.0.1:3002
```

不想带 TG 时：`bash scripts/dev-local.sh --no-tg`。

浏览器打开 <http://127.0.0.1:3002> 可预览（无 Telegram `initData`）。

生产 / 真机：在 [@BotFather](https://t.me/BotFather) 配置 Mini App URL 指向可公网访问的域名（HTTPS）。

## 功能

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | **免费领取**主入口 + 邀请引导 |
| 套餐 | `/plans` | 免费领取 / 付费购买 |
| 邀请 | `/invite` | 分享链接、邀请码、收益概览 |
| 我的 | `/account` | 账号、套餐入口、App 下载、官网/客服 |
| 我的套餐 | `/connect` | 套餐详情、VPN/机场使用教程、订阅链接 |
| 结账 | `/checkout/[planId]` | 选支付通道并打开支付页 |

视觉：中灰氛围底 + 深色品牌主舞台、琥珀点缀、文字底栏与大按钮；四入口直达重点。

## 结构

```
src/
  app/           # 页面
  components/    # TgShell、TelegramBoot
  lib/           # api / auth / session / telegram / site
```

- Token 键：`habibi_tg_token`（与 H5 的 `habibi_user_token` 隔离）
- 会话：`POST /api/v1/auth/bootstrap`（Telegram user id / 本地 device id）
- 邀请：`start_param` 或 `?ref=` 会写入本地，bootstrap 时绑定
- API：开发态通过 Next rewrite 代理到 `HABIBI_API_ORIGIN`（默认 `http://127.0.0.1:3001`）

## Telegram Bot / 订户

与 BotFather 配置的是**同一个 Bot**（Mini App + 私聊群发）。

1. Admin → 运营活动 → **Telegram Bot**：填 Token、Mini App URL、启用，保存后自动 `setWebhook`
2. 用户对 Bot `/start` → 写入订户表，并可点键盘打开小程序
3. Mini App 启动后会 `POST /api/v1/telegram/bind`，并弹出「允许发消息给我」（`requestWriteAccess`）
4. Admin → **Telegram 群发**：创建异步任务，游标分批推送（可暂停/继续）

Webhook：`POST {API_PUBLIC_ORIGIN}/api/v1/telegram/webhook/:projectCode/:webhookSecret`

## 规划中的鉴权

后续可增加 `POST /api/v1/auth/telegram`（initData 直接签发 JWT），与现有 bootstrap + bind 并存。

## 与 apps/web 的关系

| | web | tg |
| --- | --- | --- |
| 壳 | Shell + 底栏 | TgShell（深灰主题） |
| 登录 | 邮箱密码 | bootstrap 匿名会话（计划：Telegram initData） |
| 业务 API | 共用 | 共用 |
