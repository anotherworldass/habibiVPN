# HabibiVPN 用户端 API（`/api/v1`）

面向 **App（Flutter）** / **H5** 对接。运营后台接口见 `/admin/v1`，本文不覆盖。

Base URL（本地）：`http://127.0.0.1:3001`  
统一前缀：`/api/v1`  
金额单位：**美分 / 分**（`*_cents`）  
时间：ISO 8601 字符串或 JSON Date

---

## 1. 约定

### 鉴权

需要登录的接口带：

```http
Authorization: Bearer <user_jwt>
```

错误时常见：

```json
{ "error": "code_string", "message": "可选说明" }
```

### 归因 Header（建议 App 每次请求都带）

| Header | 说明 |
| --- | --- |
| `x-habibi-client` | 端渠道，见下表 |
| `x-habibi-package` | Android `applicationId` / iOS Bundle ID（马甲归因） |
| `x-habibi-project` | 项目 code（可选，包名优先） |
| `x-habibi-package-id` | 内部 package 行 id（活动等可选） |
| `x-habibi-site-host` | H5 域名归因（可选） |

也可走 query：`?client=&package=&project=`

### `client` 枚举

`ios_appstore` · `ios_alt` · `android_play` · `android_direct` · `h5` · `windows` · `macos`

影响：套餐目录过滤、支付方式（IAP / Web）、活动/优惠券适用端。

### App 冷启动推荐流程

```text
0. GET /app/config（用内置入口域；合并 api_bases 并探测 /health）
1. 本地有 JWT？ → 带 Bearer 调 POST /auth/bootstrap（幂等刷新身份）
2. 无 JWT？     → POST /auth/bootstrap（务必带稳定 device_id）→ 存 token
3. 拉 GET /me、GET /plans、GET /subscriptions …
4. 用户绑邮箱   → POST /auth/register（带同一 Bearer，uid 不变；可无验证码软绑定，见下）
5. 事后填邀请码 → POST /promo/bind-invite（仅未绑定过邀请人时）
```

**防刷（bootstrap）：**

- 有有效 Bearer → 不新建用户  
- 同一 `device_id`（body `client_meta.device_id` 或头 `x-habibi-device-id`）且仍有未绑邮箱匿名号 → **复用**该账号（响应 `reused: true`）  
- IP / 设备短时突发限流（默认每分钟 30；`BOOTSTRAP_IP_LIMIT_PER_MIN`）  
- 每设备每天最多新建 N 个匿名号（默认 2；`BOOTSTRAP_DEVICE_NEW_PER_DAY`）  
- 已注册账号**不会**通过 bootstrap 自动登入（需 `/auth/login`）  
- 超限错误：`auth.bootstrap_rate_limited` / `auth.bootstrap_device_limited`（429）

---

## 2. 认证与账号

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/bootstrap` | 可选 | 匿名冷启动 / 幂等续期 |
| POST | `/auth/register/send-code` | 可选 | 发送注册/绑邮验证码（不创建用户） |
| POST | `/auth/register` | 可选 | 验码后注册/绑定；匿名 Bearer 且无 `code` 时可软绑定（未验证） |
| POST | `/auth/login` | 无 | 邮箱密码登录（未验证是否允许由项目策略控制） |
| POST | `/auth/login/send-code` | 无 | 发送登录验证码（防枚举） |
| POST | `/auth/login/code` | 无 | 邮箱验证码登录 |
| POST | `/auth/change-password` | 是 | 改密（需已绑邮箱） |
| POST | `/auth/forgot-password` | 无 | 申请重置码（仅已验证邮箱会发信） |
| POST | `/auth/reset-password` | 无 | 用验证码重置 |
| GET | `/me` | 是 | 当前用户（含 `preferences`） |
| PATCH | `/me` | 是 | 改资料（`phone`） |
| PATCH | `/me/preferences` | 是 | 使用偏好（连接方式，跨端同步） |

### `POST /auth/bootstrap`

```json
{
  "invite_code": "可选",
  "client_meta": {
    "timezone": "Asia/Shanghai",
    "locale": "zh-CN",
    "os_name": "iOS",
    "os_version": "18.0",
    "app_version": "1.0.0",
    "device_id": "可选设备标识"
  }
}
```

`timezone` **请传 IANA**（如 `Asia/Shanghai` / `Asia/Dubai`），勿传 `+04`、`HKT` 等缩写或偏移。各端推荐取法：

| 环境 | 推荐 API |
| --- | --- |
| Web / TG Mini App | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| iOS | `TimeZone.current.identifier` |
| Android | `TimeZone.getDefault().id` |
| Flutter | `FlutterTimezone.getLocalTimezone()` 或等价 IANA |

服务端会对偏移/常见缩写做归一化，但 **无法** 把 `+04` 唯一映射到某个城市（迪拜/巴库等同偏移），故仍以 IANA 为准。

响应：

```json
{
  "token": "...",
  "reused": false,
  "user": {
    "id": "...",
    "uid": 160003,
    "email": null,
    "email_verified": false,
    "email_verified_at": null,
    "status": "active",
    "invite_code": "自己的邀请码",
    "invited_by_id": null,
    "is_anonymous": true,
    "project_id": "habibi",
    "source_site_id": null,
    "source_package_id": null,
    "source_client": "android_play"
  }
}
```

App **必须**持久化并每次上传稳定 `device_id`（安装级 UUID），否则无法复用匿名号、也更容易触发 IP 限流。

### `POST /auth/register/send-code`

先发邮箱验证码，**不创建用户**。密码会暂存在 OTP payload，验码注册时需再传同一密码。

```json
{
  "email": "a@b.com",
  "password": "至少6位",
  "invite_code": "可选",
  "client_meta": {}
}
```

响应：

```json
{ "ok": true, "expires_in_seconds": 900, "verify_code": "开发环境可能返回" }
```

- 有匿名 Bearer：OTP 会记下 `bindUserId`，后续 `/auth/register` 绑到该 uid  
- 邮箱已被**已验证**用户占用 → `auth.email_taken`；仅被未验证占用时仍可发码（用于 claim / 本人补验证）  
- 当前账号已软绑定**同一**未验证邮箱时，可再次发码做补验证  
- 60 秒内重复发送 → `auth.code_cooldown`（429）  
- 邮件未配置且非开发环境 → `mail.ses.not_configured`（503）

### `POST /auth/register`

两种模式（项目策略见 Admin「系统设置 → 账号与邮箱」，key `auth.email`）：

**A. 软绑定（未验证）** — 匿名 Bearer + **不传** `code`（默认允许）：

```json
{
  "email": "a@b.com",
  "password": "至少6位",
  "invite_code": "可选",
  "client_meta": {}
}
```

- 写入 `email` + 密码，`email_verified_at = null`  
- 邮箱已被任意账号占用（含未验证）→ `auth.email_taken`（软绑定不能互抢）  
- 无匿名 Bearer 或策略关闭软绑定 → `auth.verify_code_required`

**B. 验证码注册 / 绑定** — 须先 `send-code`：

```json
{
  "email": "a@b.com",
  "password": "至少6位",
  "code": "123456",
  "invite_code": "可选",
  "client_meta": {}
}
```

- 验码成功后写入 `email` + `email_verified_at`  
- 无 Bearer：新建注册用户  
- 有匿名 Bearer / OTP 内 bindUserId：绑定到当前 uid（`register_bind`）  
- 若邮箱被未验证账号占用且策略允许 claim：剥离原账号邮箱后绑定/注册（原 UID 套餐保留）  
- 若占用者已验证 → `auth.email_taken`  
- 验证码错误 → `auth.verify_code_invalid`

用户对象含 `email_verified` / `email_verified_at`。

### `POST /auth/login`

```json
{ "email": "a@b.com", "password": "...", "client_meta": {} }
```

- 邮箱未验证且项目策略关闭「未验证允许密码登录」→ `auth.email_unverified`（403）  
- 默认策略：未验证**不可**密码登录；可在 Admin 打开  
- 找回密码 / 邮箱验证码登录仍仅面向已验证邮箱

### `POST /auth/login/send-code` / `login/code`

```json
// send-code — 始终 ok（防枚举）；仅已验证邮箱会发信
{ "email": "a@b.com" }
{ "ok": true, "expires_in_seconds": 900, "verify_code": "开发环境可能返回" }

// code 登录
{ "email": "a@b.com", "code": "123456", "client_meta": {} }
```

验证码错误 → `auth.verify_code_invalid`。

### `POST /auth/change-password`

```json
{ "current_password": "...", "new_password": "至少6位" }
```

匿名未绑邮箱 → `auth.anonymous_no_password`

### `POST /auth/forgot-password` / `reset-password`

```json
// forgot
{ "email": "a@b.com" }
// 始终 { "ok": true }（防枚举）。仅「已注册且 email 已验证」会发 SES 邮件。
// 开发环境可能额外返回：
{ "ok": true, "reset_code": "123456", "expires_in_seconds": 900 }

// reset
{ "email": "a@b.com", "code": "123456", "new_password": "新密码" }
```

生产默认不返回 `reset_code`，由项目 SES 发信。可用 `PASSWORD_RESET_DEV_RETURN_CODE` 控制。存量已有邮箱用户在迁移时已回填 `email_verified_at`。

### `PATCH /me`

```json
{ "phone": "+8613800138000" }
// 或 { "phone": null } 清空
```

### `GET /me` → `preferences`

跨端同步的使用偏好（推荐连接方式）：

```json
{
  "preferences": {
    "connect_mode": "unset",
    "connect_clients": [],
    "connect_pref_source": null,
    "connect_pref_at": null
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `connect_mode` | `unset` / `official_app` / `subscription_client` |
| `connect_clients` | 订阅客户端标签，如 `shadowrocket`、`clash`、`hiddify`…（可选） |
| `connect_pref_source` | 写入来源：`onboarding` / `connect_page` / `settings` / `claim_prompt` / `inferred` |
| `connect_pref_at` | 最后写入时间 ISO |

与 `source_client`（注册归因）无关：前者是「喜欢怎么用」，后者是「从哪端来」。

### `PATCH /me/preferences`

```json
{
  "connect_mode": "subscription_client",
  "connect_clients": ["shadowrocket"],
  "source": "claim_prompt"
}
```

- `connect_mode` 与 `connect_clients` 至少提供一个  
- `source` 默认 `settings`  
- 选 `official_app` / `unset` 时会清空 `connect_clients`  
- `source: "inferred"` **不会覆盖**用户已显式选择的偏好（返回 `skipped: true`）  
- 允许的 client 标签：`shadowrocket` · `clash` · `clash_meta` · `hiddify` · `singbox` · `quantumult_x` · `stash` · `surge` · `other`

成功：

```json
{ "preferences": { "connect_mode": "official_app", "connect_clients": [], "connect_pref_source": "connect_page", "connect_pref_at": "…" } }
```

---

## 3. 套餐 / 节点 / 订阅

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/plans` | 可选 | 当前端可见套餐目录 |
| GET | `/nodes` | 无 | 节点池区域摘要（无 IP/链接） |
| GET | `/subscriptions` | 是 | 全部订阅槽；默认本地快照；`?live=1` 强刷；`locale` 解析 `plan_name` |
| GET | `/subscription` | 是 | 兼容：主订阅 + 列表；同上 |
| GET | `/subscriptions/:id` | 是 | 单槽并向上游同步；同上 |
| POST | `/subscriptions/claim` | 是 | 免费领取 |
| POST | `/subscriptions/:id/refresh-url` | 是 | 换订阅链接（旧链失效） |

### `GET /plans?client=android_play`

响应含 `groups[]` 与 `plans[]`。套餐字段见 `@habibi/shared` 的 `PlanView`（价格、`payment_mode`、`store_product`、`is_free_claimable`、`already_claimed`、`group_id` 等）；分组见 `PlanGroupView`。

`locale`（或 `lang` / `Accept-Language`）用于解析套餐 / 分组 `name`；内置 `zh` / `en`，回退顺序：请求语言 → `en` → `zh` → 任意非空。同时返回完整 `name_i18n` / `description_i18n` 供端上切换。

套餐分组（目录展示用，不影响支付/开通）：

| 字段 | 含义 |
| --- | --- |
| `groups[]` | 当前项目下 **已启用** 的分组（按 `sort_order`）；即使本端暂无上架套餐也会返回 |
| `plans[].group_id` | 所属分组 id；无分组、或分组已禁用时为 `null`。前端可按需隐藏空组或完全不展示分组 UI |

计费展示：

| 字段 | 含义 |
| --- | --- |
| `validity_seconds` | 开通时长（相对秒）；与 `validity_calendar_months` 互斥 |
| `validity_calendar_months` | 自然月数；开通按日历同日写 `expire_at`（如 12 = 一年后同日）。与 `validity_seconds` 互斥 |
| `billing_period_seconds` | **目录计费周期**（秒），仅用于日均/比价，不参与开通 |
| `daily_price_cents` | 派生：`floor(price_cents * 86400 / period)`；`period = billing_period_seconds ?? validity_seconds ?? calendar_months×30天` |
| `data_limit_bytes` | 流量上限（字节）；`0` / 空视实现可为不限 |
| `reset_policy` | 流量周期重置：`no_reset` / `day` / `week` / `month` / `year` / `custom`（开通时传给 WireRaw） |
| `custom_reset_interval` | 仅 `reset_policy=custom`：Go duration，如 `720h`（滚动小时，≠自然月） |

配置示例：

- 1 个月 30G（到期清空）→ 自然月 `1` 或固定 30 天 + 30G + `no_reset`
- 1 年累计 300G → 自然年 `12` 月或 365 天 + 300G + `no_reset`
- **1 年期每月 30G、每月同一天清空** → `validity_calendar_months=12` + 30G + **`reset_policy=month`**（不要用 `custom`/`720h`，那是滚动 30 天）

```
GET /api/v1/plans?client=h5&locale=en
```

### `GET /subscriptions?locale=en`

每条订阅含 `plan_name`（按 `locale` / `lang` / `Accept-Language` 解析，规则同 `/plans`）以及可选 `plan_name_i18n`。`GET /subscription`、`GET /subscriptions/:id` 与领取/刷新链接等写操作响应中的 `subscription` 同样支持。

流量周期重置相关字段（与套餐 `reset_policy` 对齐，供用户端展示「每月重置 / 下次重置时间」）：

| 字段 | 说明 |
| --- | --- |
| `reset_policy` | `no_reset` / `day` / `week` / `month` / `year` / `custom`；优先上游，否则取关联套餐 |
| `custom_reset_interval` | 仅 `custom`：Go duration，如 `720h` |
| `next_reset_at` | 下次流量清空时间（RFC3339）；上游若返回则透传，否则按槽位 `createdAt` + 策略估算（自然月/年按开通日对齐，day/week/custom 为滚动周期） |
| `used_traffic_bytes` / `data_limit_bytes` | 已用 / 上限；有限额且 `reset_policy ≠ no_reset` 时建议同时展示 `next_reset_at` |

**同步策略（列表）**：

- **默认**：立即返回本地快照（含上次同步缓存的用量 / 限额 / 在线设备等）；若槽位 `last_synced_at` 为空或超过约 30s，服务端在后台异步向 WireRaw 刷新（不阻塞本次响应）。
- **`?live=1`**（或 `true` / `yes`）：并行向上游强刷全部槽后再返回。
- **`last_synced_at`**：该槽本地快照时间；前端可用其判断数据新鲜度。
- **单槽** `GET /subscriptions/:id`：始终实时同步上游。

VPN 连接：**不要**用 `/nodes` 拨号；用订阅里的 `subscription_url` 导入客户端。

### `POST /subscriptions/claim`

```json
{ "plan_id": "..." }
```

仅 `is_free_claimable` 套餐。

---

## 4. 支付（Web / H5 / 非商店）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/payment-channels` | 无 | 可用通道；可加 `?plan_id=` |
| POST | `/orders` | 是 | 创建订单并拿支付链接 |
| GET | `/orders` | 是 | 我的订单列表 |
| GET | `/orders/:id` | 是 | 单笔；`?refresh=true` 向上游查单 |
| GET / POST | `/payments/callback/:providerCode` | 无 | 支付通道回调（服务端）。易支付兼容网关（Accepto）成功应答为 `success`，其它网关为 `SUCCESS`。GET query 与 POST body 均可。 |

### `POST /orders`

```json
{
  "plan_id": "...",
  "channel_id": "...",
  "coupon_code": "可选",
  "client": "h5",
  "jump_url": "https://支付完成后回跳"
}
```

响应：`{ "order": { "id", "status", "payment_url", "amount_cents", ... } }`

客户端轮询 `GET /orders/:id` 直到 `paid` / `provisioned`。

### `GET /orders?status=&limit=&offset=`

```json
{
  "total": 1,
  "items": [
    {
      "id": "...",
      "status": "provisioned",
      "amount_cents": 990,
      "plan": { "id": "...", "code": "...", "name": "..." }
    }
  ]
}
```

---

## 5. 应用内购（IAP）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/iap/apple/verify` | 是 | StoreKit 2 交易核销 |
| POST | `/iap/apple/notifications` | 无 | App Store Server Notifications V2 |
| POST | `/iap/google/verify` | 是 | Google Play Billing 核销 |

后台需为套餐配置对应 `store_product`（`app_store` / `google_play`）。

### Apple

```json
{ "signed_transaction": "<StoreKit JWS 或 mock:productId:txId>" }
```

本地：`APPLE_IAP_MODE=mock`（进程级，只放 env；不要做到马甲上）。  
上线：`APPLE_IAP_MODE=live`。`live` 拒 `mock:` / JSON 假票，仍接受审核沙盒的真 JWS。  
Bundle 不读 env：JWS `bundleId` 必须等于该用户项目下已启用的 iOS / `ios_appstore` 马甲 `packageName`（Admin「App 包名 / 马甲」）。未登记则 `iap.bundle_mismatch`。  
TiTiVPN iOS：StoreKit 2 购买后上传 `verificationData.serverVerificationData`（JWS）；调试可加 `--dart-define=APPLE_IAP_MOCK=true`，票据格式 `mock:<productId>:<txId>[:bundleId]`。

### Google

```json
{
  "product_id": "sku_month",
  "purchase_token": "mock:sku_month:GPA.123",
  "package_name": "可选；须为该用户项目下已启用的 Android / Play 马甲包名"
}
```

本地：`GOOGLE_IAP_MODE=mock`。  
上线：`live` + `GOOGLE_IAP_SERVICE_ACCOUNT_JSON`。  
`package_name` 省略时用项目主 Android / Play 马甲；传入但不属于该项目则 `iap.package_mismatch`。不再使用 `GOOGLE_IAP_PACKAGE_NAME`。

成功：`{ "order": {...}, "created": true|false }`（幂等）。

---

## 6. 运营增长

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/campaigns/public` | 否 | 当前 H5 邀请达标活动摘要（无个人进度） |
| GET | `/campaigns` | 是 | 当前可参与活动 |
| POST | `/campaigns/:id/participate` | 是 | 领取 / 抽奖 / 邀请达标补领 |
| POST | `/redeem` | 是 | 兑换码 |
| POST | `/coupons/preview` | 是 | 下单前试算优惠 |

### `GET /campaigns`

可选 `locale` / `lang` query，或 `Accept-Language`。按语言解析 `ui.title` / `ui.subtitle` / `ui.button_text`（回退：请求语言 → en → zh）。

响应片段：

```json
{
  "locale": "zh",
  "campaigns": [
    {
      "id": "...",
      "code": "camp_...",
      "type": "daily_claim",
      "locale": "zh",
      "ui": {
        "title": "每日免费加速",
        "subtitle": "每天可领取 1 小时",
        "button_text": "立即领取",
        "title_i18n": { "zh": "...", "en": "..." },
        "subtitle_i18n": { "zh": "...", "en": "..." },
        "button_text_i18n": { "zh": "...", "en": "..." }
      },
      "can_participate": true
    }
  ]
}
```

`type` 可为 `daily_claim` / `lottery` / `invite_milestone`。邀请达标活动额外返回：

```json
{
  "type": "invite_milestone",
  "reward": { "kind": "vpn_plan", "plan_id": "...", "plan": { "id": "...", "name": "永久 VIP" } },
  "already_participated": false,
  "can_participate": false,
  "ineligible_reasons": ["campaign.invite_progress"],
  "invite_progress": {
    "required_count": 5,
    "current_count": 2,
    "grant_mode": "auto",
    "plan_id": "...",
    "per_invite_plan_id": "...",
    "per_invite_plan": { "id": "...", "name": "新用户免费 1 天" },
    "per_invite_granted_count": 2,
    "requirements": {
      "paid": false,
      "has_subscription": true,
      "has_traffic": true,
      "min_traffic_bytes": null
    }
  }
}
```

只统计活动开始后新注册的直邀。`grant_mode=auto` 时达标后后台自动开通套餐；`claim` 时需 `POST /campaigns/:id/participate`。流量条件看订阅同步缓存（`usedTrafficBytes`），不是秒级实时。未达标 reason 为 `campaign.invite_progress`。

若配置了 `per_invite_plan_id`，达标前按注册时间排序的前 N-1 个合格直邀各开通一次该套餐（绑定邀请 / 被邀人开通订阅后自动发放）；第 N 个只发达标套餐。未配置则为 `null`。`already_participated` / 每人一次上限只看达标领取，不含每邀账本。

`reward.plan` / `invite_progress.per_invite_plan` 为套餐展示名，以后台当前配置为准。

### `GET /campaigns/public`

无需登录。按站点解析项目，返回当前窗口内、该 `client`（默认 h5）已启用的 `invite_milestone` 摘要：`ui`、`required_count`、`grant_mode`、`reward.plan`、`per_invite_plan`、`requirements`。不含 `current_count`。个人进度请用登录后的 `GET /campaigns`。

客户端应展示 `ui.*`，勿用后台 `name`。

领取成功且发放为「新建活动槽」时，订阅 `plan_name` 优先为活动多语言标题（`ui.title_i18n`），否则系统默认 `活动福利` / `Promo reward`；`plan_id` 为空。邀请达标开通的是指定套餐，`plan_id` 有值。

### `POST /redeem`

```json
{ "code": "XXXX", "client": "可选" }
```

### `POST /coupons/preview`

```json
{ "coupon_code": "SAVE10", "plan_id": "...", "client": "可选" }
```

优惠券模式：**下单时输入码**（无「券包领取中心」）。创建订单时带 `coupon_code`。

---

## 7. 推广 / 分销（`/promo/*`）

均需登录。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/promo/overview` | 看板汇总 |
| GET | `/promo/tools` | 邀请码 + 邀请链接 |
| GET | `/promo/rules` | 分销规则（层级比例、结算、提现） |
| GET | `/promo/team` | 邀请列表 |
| GET | `/promo/commissions` | 佣金流水 |
| GET | `/promo/team-orders` | 下级付费订单 |
| GET | `/promo/withdrawals` | 提现记录 |
| POST | `/promo/withdrawals` | 申请提现 |
| PATCH | `/promo/invite-code` | 修改**自己的**邀请码 |
| POST | `/promo/bind-invite` | 绑定**邀请人**（仅一次） |
| GET | `/promo/catalog` | 佣金商城商品 |
| POST | `/promo/spends` | 发起兑换申请 |
| GET | `/promo/spends` | 我的兑换单 |
| GET | `/promo/wallet-ledger` | 钱包流水 |

### `overview` 关键字段

| 字段 | 含义 |
| --- | --- |
| `team_total` | 下级总人数 |
| `levels` | 各级人数 `{ "1": n, "2": n, ... }` |
| `paid_users` | 累计付费下级人数（去重） |
| `new_users_7d` / `new_payers_7d` | 近 7 日新用户 / 付费人数 |
| `today_earnings_cents` 等 | 佣金 |
| `available_cents` / `pending_cents` … | 钱包 |

### `GET /promo/team?level=&limit=&offset=`

```json
{
  "total": 10,
  "items": [
    {
      "user_id": "...",
      "email_masked": "ab***@x.com",
      "level": 1,
      "status": "active",
      "created_at": "...",
      "has_paid": true,
      "paid_count": 2
    }
  ]
}
```

### `POST /promo/bind-invite`

```json
{ "invite_code": "ABC123" }
```

已绑定 → `invite.already_bound`（409）。

### `POST /promo/withdrawals`

```json
{
  "amount_cents": 10000,
  "method": "usdt",
  "account": { "address": "T..." }
}
```

`method` / 最低额见 `overview.withdraw_methods` / `min_withdraw_cents`。

---

## 8. 公告（App / H5 共用）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/announcements` | 无 | 当前端可见的已发布公告 |

按 **项目** 归因（`x-habibi-package` / site host / `x-habibi-project`），再按：

- `client`（端）
- `package` / `package_id`（马甲，可选）
- 站点（H5 host → site）
- `type`（可选：`modal` / `banner` / `top_bar`）
- `locale`（多语言，同版本更新）

投放规则（Admin 配置）：

- **投放端为空** → 全部端  
- **限定包为空** → 不限制马甲  
- **限定站点为空** → 不限制 H5 域名  
- 若配置了限定包/站点，则请求必须带上对应归因才能命中  

```http
GET /api/v1/announcements?locale=zh&type=banner
Header: x-habibi-client: h5
# App: x-habibi-package: com.example.app
```

```json
{
  "project_code": "habibi",
  "client": "h5",
  "announcements": [
    {
      "id": "...",
      "type": "banner",
      "locale": "zh",
      "title": "系统维护通知",
      "body": "...",
      "title_i18n": { "zh": "...", "en": "..." },
      "body_i18n": { "zh": "...", "en": "..." },
      "action_url": "https://...",
      "dismissible": true,
      "repeat": "once",
      "priority": 10
    }
  ]
}
```

`repeat`：

| 值 | 含义 |
| --- | --- |
| `once`（默认） | 用户关闭后客户端持久记住，不再显示 |
| `every_launch` | 本次会话内关闭后不再弹；下次冷启动可再显示（直至过期/归档） |

与 `dismissible`（是否允许关闭）独立。

Admin：运营活动 → **公告**（内部 `code` 创建时按时间自动生成，如 `ann_20260727_233045_a1b2`）。个人站内信（按用户）后续另做。

---

## 9. App 远程配置 / 版本更新

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/app/downloads` | 无 | 官网展示包或指定马甲的下载目录 |
| GET | `/app/dl` | 无 | 记录下载点击并 302 跳转 |
| GET | `/app/config` | 无 | 按包下发客户端配置（多域名、开关、扩展 JSON） |
| GET | `/app/update-check` | 无 | 检查是否有更新 |

### `GET /app/downloads`

公开下载目录，无需登录。官网按请求 Host（或 `x-habibi-site-host`）解析项目，只返回后台勾选“官网下载页展示”的已启用包；每个平台最多一项。

马甲落地页传已知包名，不会暴露其它马甲：

```http
GET /api/v1/app/downloads?package=com.example.app
GET /api/v1/app/downloads?package=com.example.app&platform=android
```

响应：

```json
{
  "project": { "id": "habibi", "code": "habibi" },
  "items": [{
    "id": "pkg_id",
    "name": "Android 主包",
    "package_name": "com.example.app",
    "platform": "android",
    "client": "android_direct",
    "version_name": "1.3.0",
    "action_url": "https://cdn.example.com/app.apk",
    "store": false
  }]
}
```

### `GET /app/dl`

下载按钮统计跳转，无需登录：

```http
GET /api/v1/app/dl?package=com.example.app&platform=android
```

服务端累计包下载点击，并按“包 + 当时解析到的发布版本 + Asia/Shanghai 日期”统计，然后以 `302` 跳转到最新已发布版本的下载地址（商店端跳商店地址）。版本名和 versionCode 会写入快照，即使版本记录以后删除，历史统计仍可识别。仅配置包级商店链接、尚无发布版本时归入“未标记版本”。响应包含 `Cache-Control: no-store`。商店端统计的是跳转点击及跳转时对应版本，不代表实际安装版本。

Admin：项目管理 → App 包名 / 马甲 →「官网下载页展示」；运营统计可分别按包、按版本查看区间下载点击。

### `GET /app/config`

**必填：** 包名（`package` / `package_name` query 或 `x-habibi-package`）。未知或未启用 → `404 package.unknown`。

同一包名可在 iOS / Android 各有一条记录；解析时需带 `client`（`x-habibi-client` / `?client=`）或 `platform`（`x-habibi-platform` / `x-habibi-os` / `?platform=`），否则多端同名会 `404`。

```http
GET /api/v1/app/config?package=com.titivpn&client=ios_appstore
# 或 Header: x-habibi-package: com.titivpn + x-habibi-client: ios_appstore
```

响应：

```json
{
  "package": {
    "package_name": "com.titivpn",
    "client": "ios_appstore",
    "platform": "ios"
  },
  "api_bases": ["https://api1.example.com", "https://api2.example.com"],
  "h5_bases": ["https://h5.example.com"],
  "support": { "telegram": "https://t.me/...", "email": "support@example.com" },
  "feature_flags": { "iap_enabled": true, "promo_enabled": true },
  "extras": {}
}
```

说明：

- `api_bases` / `h5_bases`：有序 https 列表（无尾斜杠）；客户端应按序探测并缓存。
- **不能替代** App 内置入口域名：主域全挂时仍需发版或静态通道。
- `extras`：自由对象；旧版客户端必须忽略未知键。
- 不含密钥、节点 IP、订阅链接。

Admin：项目管理 → App 包 → 编辑 →「API 域名列表 / extras 嵌套键值对」。

### `GET /app/update-check`

**必填：** 包名 + `version_code`（整数）。无包名 → `404 package.unknown`（不默认项目）。

```http
GET /api/v1/app/update-check?package=com.example.app&version_code=120&locale=zh
# 或 Header: x-habibi-package / Accept-Language
```

`locale`（或 `lang` / `Accept-Language`）用于解析标题与说明；内置 `zh` / `en`，回退顺序：请求语言 → `en` → `zh` → 任意非空。

响应：

```json
{
  "update": "none" | "optional" | "force",
  "package": {
    "package_name": "com.example.app",
    "client": "ios_appstore",
    "min_support_version_code": 100
  },
  "current_version_code": 120,
  "latest": {
    "version_name": "1.3.0",
    "version_code": 130,
    "locale": "zh",
    "title": "发现新版本",
    "changelog": "- 修复…",
    "title_i18n": { "zh": "发现新版本", "en": "What's New" },
    "changelog_i18n": { "zh": "- 修复…", "en": "- Fixes…" },
    "download_url": null,
    "store_url": "https://apps.apple.com/...",
    "action_url": "https://apps.apple.com/...",
    "force_update": false
  }
}
```

扩展语言：在 `packages/shared` 的 `APP_COPY_LOCALES` 增加一项即可（Admin Tab 与解析逻辑会跟着走）。

判定：

1. `latest` = 该包下 `published` 中 **max(versionCode)**（允许多条 published）  
2. `current >= latest` → `none`  
3. `current < min_support_version_code`（包级）→ `force`  
4. 否则若 latest.`force_update` → `force`  
5. 否则 → `optional`  

商店端（`ios_appstore` / `android_play`）优先 `store_url`；企业签/侧载/非商店用 `download_url`（见 `action_url`）。

Admin：项目管理 → 包 →「版本」。

---

## 10. App 页面 → 接口对照（建议）

| 页面 | 接口 |
| --- | --- |
| 启动 | `GET /app/config`（可选，域名池）→ `POST /auth/bootstrap` |
| 登录/注册 | `login` / `register` |
| 公告 | `GET /announcements` |
| 检查更新 | `GET /app/update-check` |
| 首页 / 连接 | `GET /subscriptions` → `subscription_url` |
| 套餐购买 | `GET /plans` → Web:`payment-channels`+`orders` 或 IAP:`iap/*/verify` |
| 订单记录 | `GET /orders` |
| 兑换码 | `POST /redeem` |
| 每日福利 / 邀请达标 | `GET /campaigns` + `participate` |
| 推广中心 | `overview` + `tools` + `team` + `commissions` |
| 提现 | `withdrawals` |
| 账号 | `GET/PATCH /me`、`PATCH /me/preferences`、`change-password` |
| 填邀请码 | `POST /promo/bind-invite` |
| Telegram 订户 | `POST /telegram/bind`（Mini App；需已配置项目 Bot） |

### Telegram Bot（与 Mini App 一体）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/telegram/webhook/:projectCode/:webhookSecret` | 路径密钥 | BotFather webhook：落订户；私聊消息入库；`/start` 欢迎语；关键词自动回复 |
| POST | `/telegram/bind` | 用户 JWT | Body `{ init_data, write_access? }`，校验 WebApp initData 并绑定订户；同步 `language_code` / `is_premium` / `photo_url` / `allows_write_to_pm` |

Admin（`/admin/v1/telegram/*`，需选项目）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/PATCH | `/telegram/bot` | 项目 Bot 配置（token 加密存储、注册 webhook） |
| GET | `/telegram/subscribers` | 订户列表 + 统计 |
| GET/POST | `/telegram/auto-replies` | 关键词自动回复规则列表 / 创建 |
| PATCH/DELETE | `/telegram/auto-replies/:id` | 更新 / 删除规则 |
| GET/PUT | `/telegram/quick-replies` | 客服快捷回复（与统一客服台共用） |
| GET | `/telegram/broadcasts/audience` | 预估群发触达人数 |
| GET/POST | `/telegram/broadcasts` | 群发任务列表 / 创建异步任务 |
| GET | `/telegram/broadcasts/:id` | 任务进度 |
| POST | `/telegram/broadcasts/:id/pause\|resume\|cancel` | 暂停 / 继续 / 取消 |

群发为**游标分批异步任务**（不阻塞 HTTP），适合大量订户；每项目同时仅一个 `queued/running` 任务。自动回复按优先级匹配第一条启用规则（`/start` 不参与关键词匹配）。

---

## 11. 环境变量（客户端相关）

| 变量 | 用途 |
| --- | --- |
| `APPLE_IAP_MODE` | 进程级 `mock` / `live`（拒假票）。本机 mock，线上 live。不下放马甲 |
| `GOOGLE_IAP_MODE` | 同上 |
| `APPLE_IAP_BUNDLE_ID` | 已废弃，忽略。改用 Admin 马甲 `packageName` |
| `GOOGLE_IAP_PACKAGE_NAME` | 已废弃，忽略。改用 Admin 马甲 `packageName` |
| `GOOGLE_IAP_SERVICE_ACCOUNT_JSON` | Play 核销服务账号 |
| `WEB_PUBLIC_ORIGIN` | 邀请链接域名 |
| `PASSWORD_RESET_DEV_RETURN_CODE` | 开发是否返回重置码 |
| `BOOTSTRAP_IP_LIMIT_PER_MIN` | bootstrap 每 IP 每分钟上限（默认 30） |
| `BOOTSTRAP_DEVICE_NEW_PER_DAY` | 每设备每天新建匿名号上限（默认 2） |
| `BOOTSTRAP_REQUIRE_DEVICE_ID` | `true` 时强制要求 device_id |

---

## 12. 维护说明

- 契约类型逐步沉淀在 `packages/shared`（如 `PlanView`、`ClientChannel`）。  
- Admin 能力（项目管理、审核、上游运维）**不**对 App 开放。  
- 文档随接口变更更新本文件；重大变更请同步 Flutter / H5 同学。
