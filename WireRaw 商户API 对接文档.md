# WireRaw 商户API 对接文档

> 本文给出商户 API 接入面：顾客 / 套餐 / 节点 / 拨号 / 对账 / 错误。SDK 接入与多语言示例见左侧「SDK 接入」标签页； SD-WAN 单独见左侧「SD-WAN」标签页。

## 1. 商户接入边界

生产环境必须使用 HTTPS。商户 SDK Key 是长期服务端密钥，只能放在商户后端、CRM、计费系统或密钥管理器里，不能放进 App、网页前端、桌面客户端或发给顾客的 SDK 包。

| 场景 | 凭据 | 获取方式 | 放置位置 | 过期 / 轮换 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 商户后台（人工） | 登录会话 + MFA | `POST /v1/auth/login`（前端自动调） | 浏览器 session（HttpOnly cookie） | 8h + 滑动续期 | 用于人工管理顾客 / 查看流量 / 轮换 Key；MFA 强烈推荐开启 |
| 商户后端 / CRM | `X-Wireraw-Key-ID`+`X-Wireraw-Key-Secret` | 商户后台 → SDK Keys → 创建（Secret 仅显示一次） | 服务端 env / KMS / Vault；权限 0600 | 长期；轮换通过 `/v1/platform/sdk-keys/{key_id}/rotate` | 服务端到控制中心的自动化接入；可绑 IP 白名单与 scope |
| 顾客 App | 商户自己的登录态 | 商户自有鉴权（OAuth / 手机号验证码 / 邮箱登录等） | 顾客设备 | 商户决定 | App 调商户后端，不直接持有 WireRaw Key |
| 顾客订阅 | 每顾客独立 `subscription_url` | 创建顾客时自动签发 | 通过商户后端推给顾客或 App 保存 | 可撤销（`POST .../revoke`）、可换发 | 链接里嵌 token，吊销后立即失效 |

**关键纪律**：如果商户没有后端，不要把 SDK Key 打进 App。此类场景应只给顾客订阅链接，或先实现顾客短期 token 交换再开放 App 直连控制中心。

## 2. API 端点全览

商户常用 API 端点速查。

| WireRaw 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/proxy/customer-plans` | GET | 商户可见的顾客套餐；创建顾客的 `next_plan_ref` 必须来自这里 |
| `/v1/proxy/customers` | GET / POST | 顾客列表 / upsert；商户身份自动限定为自己的顾客；用 `next_plan_ref` 绑套餐 |
| `/v1/proxy/customers/by-username` | GET |**按 username 查单个顾客**（只传 `username`，商户身份自动推断）；数据不同步、手上没 `end_user.id` 时用 |
| `/v1/proxy/customers/online` | GET |**当前商户（含子账号）在线顾客 username 列表**；只返回 username，支持 `limit`/`offset` 分页，适合大体量 |
| `/v1/proxy/customers/batch-lookup` | POST |**批量按 username 查顾客**（≤50/次）；同步多顾客免 N 次往返；返回命中记录 + 未命中 username |
| `/v1/proxy/customers/bulk-status` | POST |**批量启用/停用顾客**（按 username/id，≤100/次）；per-item 结果，部分失败不整体失败 |
| `/v1/proxy/customers/bulk-extend` | POST |**批量续期/加量**（按 username/id，≤100/次）；validity_seconds + additional_bytes；per-item 结果 |
| `/v1/proxy/customers/bulk-revoke` | POST |**批量撤销订阅**（按 username/id，≤100/次）；旧链接立即失效、可重发；per-item 结果 |
| `/v1/proxy/customers/{id}` | GET | 顾客详情；响应含 `subscription_url` + `inbounds` + 凭据摘要 |
| `/v1/proxy/customers/{id}/subscription/extend` | POST | 续期 / 加量；`expires_at`（绝对）/ `validity_seconds`（相对）/ `additional_bytes`（加流量）至少一项 |
| `/v1/proxy/customers/{id}/subscription/revoke` | POST | 撤销订阅；旧链接立即失效；可重新签发 |
| `/v1/proxy/subscriptions/{id}` | GET | 单条订阅详情；含 `available_formats` |
| `/v1/proxy/subscriptions/refresh` | POST | 强制重新渲染订阅 |
| `/v1/proxy/nodes` | GET | 商户绑定节点池列表（平铺，每节点带 `region`） |
| `/v1/proxy/nodes/links` | GET |**按地区分组**的节点 + 协议链接模板（凭据占位）；做地区 / 节点选择面板用 |
| `/v1/proxy/dial` | POST | 拨号；`mode` 选地区拨号 / 智能拨号（见 §5.2）；返回最佳节点 + 完整协议链接 |
| `/v1/proxy/customers/traffic/summary` | GET | 流量对账摘要 |
| `/v1/proxy/customers/traffic/export` | GET | CSV 导出 |
| `/v1/proxy/merchants/{id}` | GET | 当前商户信息（套餐 / 流量 / 子账号汇总） |
| `/v1/proxy/merchants/{id}/sub-accounts` | GET / POST / DELETE | 子账号 |
| `/v1/platform/sdk-keys` | GET | 当前商户 SDK Key 列表（secret 已脱敏） |
| `/v1/platform/sdk-keys/{key_id}/{rotate,revoke}` | POST | 轮换 / 吊销 SDK Key |
| `/v1/auth/login` `/v1/auth/logout` `/v1/auth/mfa/{enroll,confirm,disable}` | POST | 后台账号登录 / 登出 / MFA |
| `/v1/auth/password` | POST | 修改后台账号密码 |

**停服**：走 `status=disabled` 或撤销订阅。

## 3. 公共请求前缀

```bash
HOST="https://demo-cont.wireraw.com"
KEY_ID="sdk_xxx"
KEY_SECRET="sdk_secret_xxx"
HDRS=(
 -H "X-Wireraw-Key-ID: ${KEY_ID}"
 -H "X-Wireraw-Key-Secret: ${KEY_SECRET}"
 -H "Content-Type: application/json"
)
```

| 请求头 | 必须 | 说明 |
| --- | --- | --- |
| `X-Wireraw-Key-ID` | 是 | 商户 SDK Key ID（`sdk_xxx` 形式） |
| `X-Wireraw-Key-Secret` | 是 | 对应 Secret；只在创建 / 轮换时显示一次，泄露立即吊销 |
| `Content-Type: application/json` | POST/PUT/PATCH 必须 | 否则 415 |
| `X-Request-ID` | 可选（推荐） | 客户端生成 UUID；与响应 `request_id` 配对，便于排障 |
| `Idempotency-Key` | 可选 |**当前服务端未做通用幂等去重（发了会被忽略）**；写幂等请用 `id`（创建顾客带相同 id = 更新而非重复创建）+ username 每商户唯一（同 username 重复创建直接 409）。详见 §9 |

Key Secret 只在创建或轮换时显示一次。**泄露应急**：立即在商户后台或由平台管理员吊销旧 Key、轮换新 Key、更新商户后端密钥并 reload 服务。如果 Key 曾经打包进 App，该 App 版本视为完全泄露，必须强制升级或停用。

## 4. 4-call 快速参考

这是商户自动化系统最小需要的调用面：查可售套餐、创建顾客、查询顾客、停用 / 撤销订阅。

> 多语言完整代码示例（PHP / Node.js / Python / Go / curl）见左侧 「SDK 接入」标签页。本节主要描述请求字段和响应字段契约，并附 curl 示例。

### 4.1 查可售顾客套餐

```bash
curl -fsS "${HOST}/v1/proxy/customer-plans" "${HDRS[@]}" | jq .
```

商户只能看到已绑定给自己的顾客套餐。**按套餐开户**时，`next_plan_ref` 必须用返回列表中的 `code`；也可以**不选套餐**，直接传 `expire_at`（绝对到期）或 `validity_seconds`（相对时长）开户（见 §4.2「免套餐开户」）。包月商户通常绑定 7 天 / 15 天 / 1 月 / 3 月 / 6 月 / 1 年 / 2 年套餐；按量商户通常绑定 10G / 100G / 200G / 500G / 1T / 2T / 5T 套餐。

> **套餐模型现状（对接必读，避免误解）**：系统已把「套餐」拆成三类相互正交的模型，`/v1/proxy/customer-plans` 只覆盖其中**一类**：
>
> | 模型 | 角色 | 端点 / 字段 |
> | --- | --- | --- |
> | **CustomerPlan**（顾客销售套餐 / SKU） | 顾客**购买**的业务套餐入口（流量 / 时长 / 协议）；开户 `next_plan_ref` 用它的 `code` | 本端点 `/v1/proxy/customer-plans` |
> | **MerchantCatalogPlan**（商户目录套餐） | 商户**可售目录 / 展示层**套餐（商户自身的等级 / 配额 / 速率档位）；不是顾客开户直接用的 SKU | `/v1/proxy/merchant-plans`（admin 维护） |
> | **MerchantBandwidthPlan**（限速策略） | **限速 / 带宽档位**策略，控制顾客上下行速率与容量；**不等于销售套餐**，顾客通过 `current_bandwidth_plan_ref`（id）绑定 | `/v1/proxy/merchant-bandwidth-plans` |
> | **`effective_plan`**（运行时生效口径） | **运行时实际生效**的合并结果，由顾客当前绑定 + 字段覆盖 + 限速策略共同决定；**SDK / 订阅侧应直接看 `effective` 结果，不要自己拼**三类模型 | 顾客响应里的 `bandwidth_policy` / effective 字段 |
>
> 因此 `/v1/proxy/customer-plans`：**仍是「查可售顾客套餐」的兼容端点、未废弃**，但它**不是所有套餐模型的全集**，**也不代表限速策略（MerchantBandwidthPlan）的全集**。限速 / 带宽档位查 `/v1/proxy/merchant-bandwidth-plans`；顾客实际生效口径以响应里的 `effective` / `bandwidth_policy` 为准。

**响应字段**：

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `code` | string | `100g_lifetime` | 创建顾客时传给 `next_plan_ref`；唯一 |
| `name` | string | `100GB / 不限时长 ` | 后台展示名 |
| `type` | enum | `traffic` | `duration` / `traffic` / `combined` |
| `data_limit_bytes` | int | `107374182400` | 流量上限（字节）；`0` 或空表示不限 |
| `validity_seconds` | int | `2592000` | 有效期秒数；`0` 表示不限时 |
| `online_ip_limit` | int | `3` | 同时在线设备上限；可被顾客字段覆盖 |
| `protocols` | array<string> | `["vless","trojan"]` | 套餐允许的协议；与节点 capabilities 交集决定可派 |
| `price_monthly_cents` | int | `9900` | 月付价格（分） |
| `enabled` | bool | `true` | `false` 即下架，不可再用于新建 |

### 4.2 创建顾客

**开户三选一**（有效期来源，任选其一）：① 套餐 `next_plan_ref`（字符串 code，配额/时长从套餐推）；② 绝对到期 `expire_at`（RFC3339，直接指定到期时刻，不必选套餐）；③ 相对时长 `validity_seconds`（now + N 秒）。优先级 `expire_at` > `validity_seconds` > `next_plan_ref`。

**最小请求体（按套餐）**：`username` + 套餐编码 `next_plan_ref`（注意是字符串 code，不是数字 id）。商户绑定、有效期、流量上限、同时在线设备上限都从套餐自动推。

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers" "${HDRS[@]}" -d '{
 "username": "alice",
 "next_plan_ref": "100g_lifetime"
}' | jq .
```

**最小请求体（直接给到期时间，不选套餐）**：`username` + `expire_at`。后端不强塞默认套餐、不被默认配额覆盖（流量不限，除非另传 `data_limit_bytes`）；商户名下没有任何套餐也能这样开户。

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers" "${HDRS[@]}" -d '{
 "username": "alice",
 "expire_at": "2026-07-01T18:30:00Z"
}' | jq .
```

> **常见误解**：本系统的"套餐 ID" 是**字符串 plan code**（如 `100g_lifetime` / `unlimited_1mo` / `starter_500g_30d`），**不是数字 id**。默认套餐不再预生成"流量 × 时长"组合；需要组合时，商户创建顾客直接传 `data_limit_bytes` + `validity_seconds`，或使用 admin 显式创建的自定义组合套餐。`next_plan_ref` 字段接受 `/v1/proxy/customer-plans` 响应里每条 plan 的 `code` 字段。如果你拿到空 `{"plans":[]}`，说明 admin 还没给你的 merchant 绑套餐（联系平台 admin 在「商户」页面把套餐 codes 绑给你）。

**请求字段**：

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `username` | string | 是 | `alice` | 商户侧顾客标识；建议在商户系统内保持唯一 |
| `next_plan_ref` | string | 条件* | `100g_lifetime` |**套餐编码（plan code，字符串）**；来自 `/v1/proxy/customer-plans` 的 `code` 字段。**不是数字 id**。\*三种开户方式（`next_plan_ref` / `expire_at` / `validity_seconds`）至少给一项；都不给则按商户默认套餐兜底（无默认套餐时报错） |
| `email` | string | 否 | `alice@example.com` | 顾客邮箱；可选，用于发订阅链接 / 找回 |
| `status` | string | 否 | `active` | 默认 `active`；`disabled` = 软停用 |
| `note` | string | 否 | `CRM order #10086` | 订单号 / CRM 备注；自由文本 |
| `id` | string | upsert 时必填 | `usr_01HXYZ...` | 不传 = 创建；传 = 更新（透传未传入字段） |

系统自动绑定字段（**不需要前端传**）：

- 当前商户 ID（按 SDK Key 推断）
- `expires_at`：按套餐 `validity_seconds` 计算
- `data_limit_bytes`：按套餐 `data_limit_bytes`
- `online_ip_limit`：按套餐 `online_ip_limit`
- 协议列表 / 入站标签：按套餐 `protocols` × 商户节点池能力交集

**进阶可选字段（覆盖套餐默认 / 免套餐直传）**：

以下字段都可选，传了就**覆盖**套餐推出来的默认值；不传则沿用套餐。创建和更新（带 `id`）都接受——所以「单顾客调额度 / 改在线数 / 限速」直接 upsert 这些字段即可。

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `online_ip_limit` | int | `5` | 同时在线设备上限；覆盖套餐值。默认不传按套餐（套餐也没有则 3） |
| `validity_seconds` | int | `2592000` |**相对**有效期（秒）。`>0` 且未显式传 `expire_at` 时，`expires_at = now + validity_seconds`，并**跳过套餐默认填充**——可不传 `next_plan_ref` 直接「时长 + 流量」开户 |
| `expire_at` | string (RFC3339) | `2026-06-30T00:00:00Z` | 显式绝对到期；优先级最高（高于 `validity_seconds` 与套餐时长）。**传了就跳过套餐默认填充**——可不传 `next_plan_ref` 直接按到期时间开户（商户名下没套餐也能建）；想顺带限流量再带 `data_limit_bytes` |
| `data_limit_bytes` | int | `107374182400` | 流量上限（字节）；覆盖套餐值。不传且走免套餐路径 = 不限流量。**流量套餐商户**（`plan_type=traffic`）受流量池约束：本值 ≤ 商户「剩余可分配流量」（`plan_traffic_remaining_bytes` = 总配额 − 已分配之和），超出后端硬拦 `proxy.merchant.traffic_quota.exceeded`；且这类商户的顾客**必须**有有限额度（不能不限流量，否则 `proxy.merchant.traffic_quota.customer_unlimited`）。开一个顾客即从池中占用、剩余自动下降 |
| `current_bandwidth_plan_ref` | string | `mbp_xxx` |**商户带宽套餐绑定**（`MerchantBandwidthPlan` 的**id**，来自 `/v1/proxy/merchant-bandwidth-plans`）。**与 `next_plan_ref` 不同**：`next_plan_ref` 是顾客销售套餐 code，`current_bandwidth_plan_ref` 是限速/容量套餐 id。绑定后限速、流量、有效期、在线设备数、协议/inbound 可见性按该套餐生效（绝对量 view 层解析,有效期绑定时落盘）；空 = 不绑定（回 merchant 默认上限）。其优先级高于 `next_plan_ref` 展开与 `validity_seconds`。响应里通过只读 `bandwidth_policy`(`source=merchant_plan` / `source_ref`) 反映实际生效来源 |
| `next_bandwidth_plan_ref` | string | `mbp_xxx` |**预约下期带宽套餐**(`MerchantBandwidthPlan` 的 id)。到期边界续期调度器自动 promote 成 `current_bandwidth_plan_ref` 并清空(一次性);空 = 不预约/清除。用于"下周期升/降速档"。与 `current_bandwidth_plan_ref`(立即生效)、`next_plan_ref`(销售 SKU)均正交。响应只读回显 `end_user.next_bandwidth_plan_ref` |
| `max_up_mbps` | int | `50` |**已废弃**：永久接受但**静默忽略**（响应带 `Deprecation: true` + `field_warnings`）。顾客限速由 `current_bandwidth_plan_ref` 套餐或 merchant 默认上限决定，商户 API 不能直接设限速 |
| `max_down_mbps` | int | `100` |**已废弃**：同 `max_up_mbps`，接受但忽略 |
| `reset_policy` | enum | `month` | 流量周期重置：`no_reset` / `day` / `week` / `month` / `year` / `custom` |
| `custom_reset_interval` | string (duration) | `"720h"` | 仅 `reset_policy=custom` 时用；Go duration 语法（`24h` / `720h`） |
| `auto_disable_inactive_days` | int | `30` | 连续未在线 N 天自动停用；`0` / 不传 = 不自动停用 |

> **免套餐开户**：手上没有合适 plan code 时，可只传 `username` + `expire_at`（绝对到期）**或**`username` + `validity_seconds`（相对时长）开户（均可再带可选 `data_limit_bytes` 限流量）。两条路径都会**跳过套餐默认填充**，商户名下没有任何套餐也能建。但**推荐优先用 `next_plan_ref`**——套餐统一管理价格 / 协议 / 配额，免套餐路径仅供临时或自定义场景。

**响应字段**：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `end_user.id` | string | 后续查询 / 停用 / 续期 / 撤销订阅的顾客主键；**强烈建议保存**|
| `end_user.username` | string | 商户传入的顾客名 |
| `end_user.status` | string | `active` / `disabled` / `pending` |
| `end_user.expires_at` | string (RFC3339) | 最终生效到期（按到期来源 `expire_at` / `validity_seconds` / 套餐 算出，见 §4.2.1） |
| `end_user.online_ip_limit` | int | 同时在线设备上限（系统按套餐绑定） |
| `subscription_url` | string | 交给顾客客户端的订阅地址；详情页必须可复制 |
| `uuid` | string | 顾客唯一 UUID —**入站协议（vless / vmess / trojan）使用的核心参数**，作为协议链接里的 user UUID |
| `password` | string | 顾客口令 —**入站协议（hysteria2 / tuic / shadowsocks）使用的核心参数**，作为协议链接里的 auth password |
| `creds_by_protocol` | object | 按协议分组的凭据视图（与顶层 `uuid` / `password`**单源等价**）：key = `vless` / `vmess` / `trojan` / `hysteria2` / `tuic` / `shadowsocks` / `anytls` / `socks`；value = `{uuid?, password?, flow?, method?}`。商户业务不想记「哪个协议用 uuid / 哪个用 password」时按协议 key 取对应字段；想直接用顶层字段也完全 OK |

`uuid` / `password` 是顾客**全局唯一**的入站凭据（owner 2026-06-02 schema 收敛单源）：所有节点 / 所有协议共用同一对值，订阅渲染、商户业务自渲染、节点 sing-box server 认证全部走这一对。撤销订阅会重新签发，旧链接立即失效。

`creds_by_protocol` 是同一份数据按协议分组的便利视图：vless / vmess / trojan / tuic 用 `uuid` 字段；hysteria2 / shadowsocks / anytls / trojan 用 `password` 字段；vless 另带 `flow=xtls-rprx-vision`，shadowsocks 另带 `method` 加密算法。

### 4.2.1 到期 / 流量字段语义（对接必读，避免歧义）

到期有三个名字，**别混**——`expire_at` 与 `expires_at`**都是绝对到期时刻**，只是用在不同端点；`expires_at` 还兼作响应里的"最终生效到期"。

| 字段 | 出现位置 | 读/写 | 语义 |
| --- | --- | --- | --- |
| `expire_at` | 创建/更新顾客 `POST /v1/proxy/customers` 请求 | 写 |**绝对到期时刻**（RFC3339），你直接指定。优先级最高，传了即跳过套餐时长。 |
| `expires_at` | 续期 `POST /v1/proxy/customers/{id}/subscription/extend` 请求 | 写 |**绝对到期时刻**（RFC3339）。与 `expire_at`**同语义**，只是续期端点的字段名带 `s`。 |
| `expires_at` | 顾客响应 `end_user.expires_at` | 读 |**最终生效到期**——系统按 `expire_at` / `validity_seconds` / 套餐 算出的实际值；顾客 / portal 看的就是它。 |
| `validity_seconds` | 创建/续期请求 + 套餐定义 | 写 |**相对时长（秒），不是绝对时刻**。创建 = `now + N`；续期 = 未到期叠加、已过期从 `now` 起；套餐自带它，系统据此算出 `expires_at`。 |

> ⚠️**误解纠正**：`expires_at`**不是**"套餐专用的到期字段"。它是**最终生效到期（结果）**，来源可能是你传的 `expire_at`、`validity_seconds`、或套餐的 `validity_seconds` 三者之一。**套餐对象本身没有 `expires_at`**——"套餐的到期"实际是套餐的 `validity_seconds`（相对时长）。 ⚠️**字段名坑**:绝对到期在**创建/更新**叫 `expire_at`、在**续期**叫 `expires_at`(带 `s`);穿错触发 `request.body.unknown_field`(后端开了 DisallowUnknownFields)。

到期来源优先级：`expire_at` > `validity_seconds` > 套餐 `next_plan_ref`。

流量也分"设"与"加"，**别混**：

| 字段 | 出现位置 | 读/写 | 语义 |
| --- | --- | --- | --- |
| `data_limit_bytes` | 创建/更新顾客请求 | 写 |**设**绝对流量上限（字节，**替换**；不传 = 不限流量） |
| `additional_bytes` | 续期请求 | 写 |**加**流量额度（字节，**增量**；仅对有限额度顾客生效，不限流量顾客忽略） |
| `used_traffic_bytes` | 顾客响应 | 读 | 已用流量（字节） |

> 流量套餐商户：设/加后该商户全顾客已分配 `data_limit` 之和必须 ≤ 剩余可分配流量（`GET /v1/proxy/merchants/{id}` 的 `plan_traffic_remaining_bytes`），否则 `proxy.merchant.traffic_quota.exceeded`；且这类商户顾客必须有有限额度。

### 4.3 查询顾客

**按 username 查单个顾客**（推荐：商户手上往往只有自己系统里的 username，没有 `end_user.id`）：

```bash
# 只传 username；商户身份由 SDK Key 自动推断，不需要传 merchant_id
curl -fsS "${HOST}/v1/proxy/customers/by-username?username=alice" "${HDRS[@]}" | jq .
```

> 数据不同步、或商户侧没保存 `end_user.id` 时，用这个接口拿回完整顾客记录（含 `id` / `subscription_url` / `uuid` / `password`，字段同下方列表响应）。`username` 在每个商户命名空间内唯一，所以不会串到别的商户的顾客。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 顾客 username；商户范围内唯一 |

**按 id 查单个顾客**：

```bash
CUSTOMER_ID="usr_xxx"
curl -fsS "${HOST}/v1/proxy/customers/${CUSTOMER_ID}" "${HDRS[@]}" | jq .
```

**批量按 username 查顾客**（一次最多 50 个，商户同步多顾客时免 N 次 by-username）：

```bash
# 按 username（也可按 end_user.id，二者可同传，合并计数 ≤50）
curl -fsS -X POST "${HOST}/v1/proxy/customers/batch-lookup" "${HDRS[@]}" -d '{
 "usernames": ["alice", "bob"],
 "ids": ["usr_01HXYZ"]
}' | jq .
```

> 返回 `{ "customers": [ ...同 by-username 的完整记录... ], "missing": ["carol"] }`：命中的进 `customers`，没查到（或不在本商户 scope 内）的 username/id 进 `missing`。`usernames` 走商户命名空间精确匹配；`ids` 走 `end_user.id`（存了 id 的商户更精确，越权 id 当未命中、不泄露存在性）。商户身份自动推断；`usernames` + `ids` 合并 >50 回 `proxy.customer.batch_lookup.too_many`，分批调即可。

**在线顾客列表**（只返回 username，适合大体量；支持分页）：

```bash
# 默认（最多 10 万）
curl -fsS "${HOST}/v1/proxy/customers/online" "${HDRS[@]}" | jq .
# 分页：每页 1000，翻到第二页
curl -fsS "${HOST}/v1/proxy/customers/online?limit=1000&offset=1000" "${HDRS[@]}" | jq .
```

> 「在线」= 该顾客当前持有未过期的拨号授权（dial grant，每次拨号续 5 分钟 TTL）。响应只含 username 数组，避免在线数到百万时拉全量记录。**在线量大时用 `limit` + `offset` 翻页**：按 username 升序稳定排序，下一页传 `offset += 上一页 count`，直到 `has_more=false`。需要某个在线顾客的详情时，再用上面的 by-username 查。

| 查询参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `limit` | int | 100000 | 单页条数；超过 10 万按 10 万截 |
| `offset` | int | 0 | 跳过前 N 条（翻页用） |

响应：

```json
{ "usernames": ["alice", "bob"], "count": 2, "offset": 0, "has_more": false, "truncated": false }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `usernames` | array<string> | 本页在线顾客 username（含子账号商户的顾客），按 username 升序 |
| `count` | int | 本页条数 |
| `offset` | int | 本次请求跳过的条数（回显） |
| `has_more` | bool | 是否还有下一页（= `truncated`，语义更直白）；`true` 时 `offset += count` 取下一页 |
| `truncated` | bool | 同 `has_more`（保留兼容旧字段） |

**全量顾客列表**（含完整字段 + 分页 + 搜索）：

```bash
curl -fsS "${HOST}/v1/proxy/customers?limit=50&offset=0&q=alice" "${HDRS[@]}" | jq .
```

**查询参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | int | 否 | 50 | 每页数量；1 ~ 200 |
| `offset` | int | 否 | 0 | 偏移量；建议小数据量用 |
| `q` | string | 否 | — | 顾客名 / 邮箱 / ID 模糊搜索；不能与 `pagination=seek` 同时使用 |
| `status` | string | 否 | — | `active` / `disabled` / `pending`；可重复 |
| `next_plan_ref` | string | 否 | — | 按套餐过滤 |
| `pagination` | enum | 否 | `offset` | `offset` / `seek`；大数据量 cursor 翻页 |
| `cursor` | string | 否 | — | `pagination=seek` 时用；空 = 首页 |

**响应字段**：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `end_user.id` | string | 顾客主键 |
| `end_user.username` | string | 商户传入的顾客名 |
| `end_user.next_plan_ref` | string | 预约下期续期的销售套餐(SKU)code |
| `end_user.current_bandwidth_plan_ref` | string | 当前绑定的商户带宽套餐 id(空 = merchant 默认上限) |
| `end_user.next_bandwidth_plan_ref` | string | 预约下期带宽套餐 id(到期边界 promote 并清空) |
| `end_user.status` | string | `active` / `disabled` / `pending` |
| `end_user.expires_at` | string (RFC3339) | 顾客可见到期时间 |
| `end_user.used_traffic_bytes` | int | 已用流量（累计字节） |
| `end_user.online_ip_limit` | int | 同时在线设备上限 |
| `online_device_count` | int |**当前在线设备数**（= 未过期拨号授权数）。单顾客详情按顾客统计；列表路径批量返回，避免 N+1。和 `online_ip_limit` 对比即「还能上几台」 |
| `end_user.online_at` | string (RFC3339) | 最近在线时间 |
| `end_user.current_node` | object | 当前/最近活跃节点；仅顾客在 10 分钟活跃窗口内且节点仍存在时返回；窗口外、无流量、节点查不到则缺省 |
| `end_user.current_node.id` | string | 当前/最近活跃节点 ID |
| `end_user.current_node.name` | string | 当前/最近活跃节点显示名 |
| `end_user.current_node.region` | string | 当前/最近活跃节点位置/国码，例如 `JP` / `SG` |
| `subscription_url` | string | 顾客订阅地址 |
| `uuid` | string | 入站协议（vless / vmess / trojan）使用的 UUID（全局单源，与所有 ProxyCredential.UUID 等价） |
| `password` | string | 入站协议（hysteria2 / tuic / shadowsocks）使用的 password（同 `uuid` 单源） |
| `creds_by_protocol` | object | 按协议分组的凭据视图（值与顶层 `uuid` / `password` 等价）；商户业务可按协议 key 直接取对应字段，免去记忆映射 |

### 4.4 停用、续期、撤销订阅

**软停用顾客**（保留数据）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers" "${HDRS[@]}" -d '{
 "id": "usr_xxx",
 "username": "alice",
 "status": "disabled"
}'
```

**批量启用 / 停用**（一次最多 100 个；部分失败不影响其它）：

```bash
# 按 username 和/或 end_user.id（二者可同传，合并计数 ≤100）
curl -fsS -X POST "${HOST}/v1/proxy/customers/bulk-status" "${HDRS[@]}" -d '{
 "usernames": ["alice", "bob"],
 "ids": ["usr_01HXYZ"],
 "status": "disabled"
}' | jq .
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `usernames` | array<string> | `usernames`/`ids` 至少一项 | 顾客 username 列表（商户命名空间） |
| `ids` | array<string> | 同上 | 顾客 `end_user.id` 列表（scope 校验，越权 id 当 `not_found`） |
| `status` | string | 是 | 仅 `active`（启用）/ `disabled`（停用） |

> `usernames` + `ids` 合并去重后 ≤100。响应 `{ "status": "disabled", "results": [{"key":"alice","ok":true}, {"key":"usr_01HXYZ","ok":false,"error":"not_found"}], "ok_count": 1, "fail_count": 1 }`：`key` 原样回显你传的 username/id，逐个返回结果，整体仍 200。`error` 可能为 `not_found` / `lookup_failed` / `update_failed`。只改 status，不动套餐 / 凭据 / 到期。

**批量续期 / 加量**（一次最多 100 个；和批量启停对称，月底批量续费用）：

```bash
# 续 30 天 + 每个加 100G；usernames 和/或 ids（合并 ≤100）
curl -fsS -X POST "${HOST}/v1/proxy/customers/bulk-extend" "${HDRS[@]}" -d '{
 "usernames": ["alice", "bob"],
 "validity_seconds": 2592000,
 "additional_bytes": 107374182400
}' | jq .
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `usernames` / `ids` | array<string> | 至少一项 | 顾客 username（命名空间）/ `end_user.id`（scope 校验） |
| `validity_seconds` | int | `validity`/`additional` 至少一项 | 相对续期（秒）：未到期叠加、已过期从 now 起 |
| `additional_bytes` | int | 同上 | 加量（字节，仅有限额度顾客生效） |

> 续期语义同 §4.4 单个 extend（叠加 / 重启 / 加量）。响应 `{ "results": [{"key":"alice","ok":true}, ...], "ok_count": N, "fail_count": M }`，`key` 回显 username/id；逐个返回、整体 200。两字段全空回 `proxy.customer.subscription.extend_empty`，合并 >100 回 `proxy.customer.bulk_extend.too_many`。

**延长订阅**：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers/usr_xxx/subscription/extend" "${HDRS[@]}" -d '{
 "expires_at": "2026-06-30T00:00:00Z"
}'
```

三种续期/加量方式，`expires_at` / `validity_seconds` / `additional_bytes`**至少给一项**（可组合，如「续 30 天 + 加 100G」）：

```bash
# 相对续期：续 30 天，不必自己算日期
curl -fsS -X POST "${HOST}/v1/proxy/customers/usr_xxx/subscription/extend" "${HDRS[@]}" -d '{
 "validity_seconds": 2592000
}'

# 只加量：追加 100 GB，不动到期
curl -fsS -X POST "${HOST}/v1/proxy/customers/usr_xxx/subscription/extend" "${HDRS[@]}" -d '{
 "additional_bytes": 107374182400
}'
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `expires_at` | string (RFC3339) | 三选一 | 绝对到期；优先级最高。与 `validity_seconds` 同传时以本字段为准 |
| `validity_seconds` | int | 三选一 | 相对续期（秒）：未到期则在剩余基础上**叠加**（不浪费剩余时长），已过期则从 `now` 起算 |
| `additional_bytes` | int | 三选一 | 追加流量额度（字节）。**仅对有限额度顾客生效**；不限流量（无 `data_limit_bytes`）顾客追加无意义会被忽略 |
| `note` | string | 否 | 续费记录备注；进审计 `proxy.customer.subscription.extend` 的 details |

> **更新顾客「到期 + 流量」走哪个 API（两种语义，字段名故意不同，别穿错）**： -**加量 / 续期（增量，日常用）**→ 本节 `extend`：`validity_seconds`（加时长，未到期叠加）/ `additional_bytes`（加流量）/ `expires_at`（设绝对到期）。**只动到期 + 流量，不碰其他字段**。 -**设绝对值 / 整体改**→ §4.2 `upsert`（`POST /v1/proxy/customers` 带 `id`）：`expire_at`（设绝对到期）、`data_limit_bytes`（**设**绝对流量上限，替换不是加）。upsert 是整体替换，只想改到期/流量时要把保留字段一起回带。 -**⚠️ 字段名坑**：绝对到期在 upsert 叫**`expire_at`**、在 extend 叫**`expires_at`**（带 s）；流量在 upsert 是**`data_limit_bytes`（设总额）**、在 extend 是**`additional_bytes`（加量）**。穿错会触发 `request.body.unknown_field`（后端开了 DisallowUnknownFields）。 -**流量套餐商户**：设/加后该商户全顾客已分配 data_limit 之和必须 ≤ 剩余可分配流量，否则 `proxy.merchant.traffic_quota.exceeded`；剩余看 `GET /v1/proxy/merchants/{id}` 的 `plan_traffic_remaining_bytes`。 各字段完整语义(`expire_at` / `expires_at` / `validity_seconds` / `data_limit_bytes` / `additional_bytes` 的读写与来源优先级)见 §4.2.1。

**撤销订阅**（旧链接立即失效）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers/usr_xxx/subscription/revoke" "${HDRS[@]}"
```

**批量撤销订阅**（一次最多 100 个；安全事件 / 批量下架用）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers/bulk-revoke" "${HDRS[@]}" -d '{
 "usernames": ["alice", "bob"],
 "ids": ["usr_01HXYZ"]
}' | jq .
```

> `usernames` 和/或 `ids`（合并去重 ≤100，`ids` 走 scope 校验）。响应同 bulk-status：`{ "results": [{"key":"alice","ok":true}, ...], "ok_count": N, "fail_count": M }`，逐个返回、整体 200。撤销后旧链接立即失效，**可逆**——顾客拿 `/subscriptions/refresh` 换发或重新开户即恢复。合并 >100 回 `proxy.customer.bulk_revoke.too_many`。

撤销后旧 `subscription_url` 不再渲染；重新开户或调 `/subscriptions/refresh` 会得到新的 token。撤销动作进入审计：`proxy.customer.subscription.revoke`。

### 4.4.1 自动续期与手动续期（next_plan_ref 销售套餐）

**自动续期**：`duration` 型顾客到期后，若其 `next_plan_ref` 非空且顾客未停用，系统调度器自动按该 SKU 续期——新周期重置已用流量、保留 `next_plan_ref`（即永久自动续期，循环直到关停）。

**关停自动续期**：清空 `next_plan_ref`（`PUT .../customers/{id}` 传 `"next_plan_ref": ""`）或把顾客置 `disabled`。

> **商户过期不级联**：商户自身的套餐（`PlanExpiresAt`）到期后，其顾客**不会**被自动续期——商户必须先续自己的商户套餐，才能继续服务下面的顾客。

**手动续期**（立即应用 `next_plan_ref`，无需等到到期）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/customers/usr_xxx/renew" "${HDRS[@]}"
```

响应：最新顾客视图（`ProxyCustomerView`），字段同 §4.3 创建响应。

| 错误码 | 含义 | 处理 |
| --- | --- | --- |
| `400 proxy.customer.next_plan_ref.required` | 顾客没有绑定 `next_plan_ref` | 先用 `PATCH /v1/proxy/customers/{id}` 绑套餐再续期 |

**Go SDK**：

```go
view, err := proxy.RenewCustomer(ctx, "usr_xxx")
```

### 4.5 订阅管理（按格式取链接 / 换发 token）

**按格式取订阅内容**（`{id}` = `end_user.id`）：

```bash
# 默认格式
curl -fsS "${HOST}/v1/proxy/subscriptions/usr_xxx" "${HDRS[@]}" | jq .
# 指定客户端格式：取值见响应里的 available_formats
curl -fsS "${HOST}/v1/proxy/subscriptions/usr_xxx?format=base64" "${HDRS[@]}" | jq .
```

| 查询参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `format` | string | 否 | 渲染格式；取值以响应 `available_formats` 为准（默认含 `base64`）。不传走默认 |

**换发订阅 token**（旧 `subscription_url` 立即失效；用于链接泄露应急 / 定期轮换）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/subscriptions/refresh" "${HDRS[@]}" -d '{
 "user_id": "usr_xxx"
}'
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user_id` | string | 是 | 顾客 `end_user.id` |
| `token_ref` | string | 否 | 自定义订阅 token（≥24 字符、非弱模式）；**留空自动生成 192-bit 随机 token（推荐留空）**|
| `available_formats` | array<string> | 否 | 该顾客订阅支持的渲染格式集合；默认 `["base64"]` |

**响应**（取链接 / 换发同结构）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `available_formats` | array<string> | 可用渲染格式列表 |
| `payload.ContentType` | string | 内容类型（如 `text/plain; charset=utf-8`） |
| `payload.Body` | string (base64) | 渲染后的订阅内容（按 `format`），base64 编码的字节；解码即得客户端可导入的订阅正文 |

> **换发 vs 撤销**：撤销（§4.4）是停掉订阅渲染（不再出链接）；换发是换一个新 token 继续可用——**链接泄露时用换发**，旧链接立即失效、顾客拿新链接即可。换发进审计 `proxy.subscription.refresh`。

## 5. 节点与拨号

> 商户后台展示当前**在线节点位置地图**，并通过拨号接口直接拿到可用 协议链接。

### 5.1 查询节点

返回与当前商户关联的节点池。两种取法：平铺列表，或按地区分组（做「先选地区、再选节点」的界面时用）。

**平铺列表**（每个节点带 `region` 字段，自己按需分组）：

```bash
curl -fsS "${HOST}/v1/proxy/nodes" "${HDRS[@]}" | jq .
```

**按地区分组**（直接拿到「地区 → 该地区节点 + 协议链接模板」结构）：

```bash
# 全部地区
curl -fsS "${HOST}/v1/proxy/nodes/links" "${HDRS[@]}" | jq .

# 只看某个地区
curl -fsS "${HOST}/v1/proxy/nodes/links?region=HK" "${HDRS[@]}" | jq .
```

响应是「地区码 → 节点数组」的映射，每个节点带不含凭据的协议链接模板（拨号时再换成带凭据的真链接）：

```json
{
 "HK": [
 { "name": "vnhk002", "links": ["vless://<uuid>@45.192.217.156:40489?...#HK01", "hysteria2://<password>@45.192.217.156:21116?...#HK02"] }
 ],
 "SG": [ { "name": "vnsg001", "links": ["..."] } ]
}
```

> `links` 里的 `` / `` 是占位符——查询节点阶段只给模板让你画地区/节点选择面板；真正要带凭据的链接走 §5.2 拨号接口（传 `username`）。

> **自渲染填占位符**：从 `customers/{id}` 取顶层 `uuid`（填到 vless / vmess / trojan 模板）或 `password`（填到 hysteria2 / tuic / shadowsocks 模板）即可，与节点 sing-box server 认证一致（owner 2026-06-02 schema 收敛单源后，顶层凭据 = 节点 users 列表 = 订阅渲染，全部同一对值）。也可用 `creds_by_protocol[]` 按协议查字段。推荐直接用 §5.2 拨号接口（传 `username`，cp 渲染好的成品链接），自渲染只在自定义 UI 选路时再用模板拼接。

**`/v1/proxy/nodes` 响应字段**：

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `name` | string | `vnhk002` | 节点显示名 |
| `region` | string | `HK` | 两位地区码（如 `HK` / `SG` / `US`）（地图打点用） |
| `status` | enum | `active` | `active` / `disabled` / `pending` |
| `public_ip` | string | `45.192.217.156` | 出口 IPv4 |
| `advertise_host` | string | `vnhk002.dgatev.com` | 面向顾客的公网主机 |
| `active_customers` | int | `123` | 当前在线顾客数 |
| `current_mbps_up` | float | `120.0` | 实时上行带宽（Mbps） |
| `current_mbps_down` | float | `180.0` | 实时下行带宽（Mbps） |

**节点池规则**：

- 节点从商户绑定的**节点组**返回。
- 同一物理节点上若开了多个协议入站（vless + hy2 + ...），**只算一个节点**返回一次；具体协议链接通过拨号接口拉。

### 5.2 拨号

`POST /v1/proxy/dial` 返回排名靠前的可用节点（已通过平台健康度筛选），每个节点附带完整协议链接。两个参数决定选路：`region`（两位地区码）+ `mode`（地区拨号 / 智能拨号）。

**三种用法**：

| 用法 | 怎么传 | 选出来的节点 | 适用场景 |
| --- | --- | --- | --- |
|**地区拨号**| `region=HK`（`mode` 留空或 `region`） |**只返回出口在 HK 的节点**（硬过滤，绝不返回其它地区；HK 无可用节点则返回空） | 顾客明确要某地区出口（如要 HK IP 看港剧、要 US IP 解锁美区） |
|**智能拨号**| `region=HK` + `mode=smart` | 以 HK 为延迟参考点，但**全球节点**凭 [从 HK 的延迟 + 负载 + 成功率] 公平竞争，可能选到邻近地区更优节点 | 顾客在 HK，只要「最快最稳」，不在乎出口具体在哪；HK 节点满载 / 被干扰时自动绕到 SG/JP |
|**全球均衡**| 都不传 | 纯按负载 + 综合评分全球选 | 没有地区偏好，只要可用节点 |

```bash
# 地区拨号：顾客要 HK 出口，HK 节点优先
curl -fsS -X POST "${HOST}/v1/proxy/dial" "${HDRS[@]}" -d '{
 "region": "HK",
 "username": "alice",
 "limit": 10
}' | jq .

# 智能拨号：顾客在 HK，要全球最优（出口地区不限）
curl -fsS -X POST "${HOST}/v1/proxy/dial" "${HDRS[@]}" -d '{
 "region": "HK",
 "mode": "smart",
 "username": "alice",
 "limit": 10
}' | jq .

# 全球均衡：无地区偏好
curl -fsS -X POST "${HOST}/v1/proxy/dial" "${HDRS[@]}" -d '{
 "limit": 10
}' | jq .
```

> **地区拨号 vs 智能拨号的区别**：地区拨号**只返回出口在该地区的节点**（硬过滤，传 `region=HK` 就只有 HK 的节点和线路，不会混进别国）；智能拨号把 `region` 只当「顾客**从哪里**连」的延迟参考点、**不锁出口地区**，仍在全球候选里挑——HK 节点拥堵 / 被阻断时会改给从 HK 看延迟更低、更空闲的节点（哪怕出口在 SG）。`region` 为空时 `mode` 无意义（两者都退化成全球均衡，返回全部）。

**请求字段**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `region` | string | 否 | 两位地区码（如 `HK` / `SG` / `US`）。地区拨号下=想要的出口地区，**只返回该地区节点**；智能拨号下=顾客所在地（延迟参考点，全球候选）。不传 = 全球均衡 |
| `mode` | string | 否 | 选路语义：留空 / `region` = 地区拨号（出口在 `region` 的节点优先）；`smart` = 智能拨号（`region` 仅作延迟参考点，全球择优）。`region` 为空时本字段无效 |
| `sticky` | bool | 否 | 粘性拨号：`true` 时偏向 RTT + 成功率最稳的节点，让同一顾客重复拨号尽量复用同一节点（少换 IP、连接更稳）。与 `mode` 正交可叠加；靠 `region` 提供延迟参考才有区分度，建议配合 `region` 用。默认 `false` |
| `username` | string | 否 | 顾客 username；指定时返回的协议链接会嵌入该顾客的 `uuid` / `password`，不传时仅返回不含凭据的链接模板 |
| `limit` | int | 否 | 候选节点数上限；不传 = 返回全部可用候选。硬上限 100（传更大值按 100 截断）——客户端通常只用前几个最优候选 |

**响应字段**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `node` | object | 当前最佳节点（含 `name` / `region` / `advertise_host` / `public_ip`） |
| `score` | float | 排名分数（越高越优） |
| `candidates[]` | array<object> | 候选节点列表；按 `score` 倒序 |
| `candidates[].node` | object | 节点信息（字段同 §5.1） |
| `candidates[].score` | float | 节点综合评分 |
| `candidates[].transport_health` | string | 节点健康分级：`healthy` / `degraded` / `blocked`（按近期探针成功率 + 阻断状态）。不影响排序，供客户端展示或 fallback 决策——例如优先用 `healthy`，`blocked` 跳过 |
| `candidates[].links` | array<string> | 节点上所有可用协议的**完整协议链接**列表（vless:// / hysteria2:// / vmess:// / trojan:// / ...），凭据已嵌入 |

**`links` 样例**（每条都是顾客可直接喂给 sing-box / Clash 的完整 URI）：

```text
vless://<uuid>@45.192.217.156:40489?encryption=none&security=tls&sni=vnhk002.dgatev.com&fp=chrome&alpn=h3%2Ch2%2Chttp%2F1.1&insecure=0&allowInsecure=0&type=tcp&headerType=none#Hong%20Kong%2001
hysteria2://<password>@45.192.217.156:21116?sni=vnhk002.dgatev.com&insecure=0&allowInsecure=0#Hong%20Kong%2002
```

- vless / vmess / trojan：链接里 `@` 之前是顾客 `uuid`
- hysteria2 / tuic / shadowsocks：链接里 `@` 之前是顾客 `password`
- 不传 `username` 时 `<uuid>` / `<password>` 保留占位字符串，由商户 SDK 后续填充

#### REALITY 协议链接

平台支持 vless + REALITY 协议（sing-box v1.10+）。admin 在 inbound 编辑表单 启用 REALITY 后，订阅链接形态切到：

```text
vless://<uuid>@<addr>:<port>?
 flow=xtls-rprx-vision
 &fp=chrome
 &pbk=<base64-url-public-key>
 &security=reality
 &sid=<short-id-hex>
 &sni=<伪装的真实大站，如 www.cloudflare.com>
 &spx=/
 &type=tcp
#<remark>
```

关键参数（与传统 vless+tls 不同的部分）：

- `security=reality`：协议层从 TLS 切到 REALITY，客户端不走 X.509 cert verify
- `pbk`：REALITY Curve25519 公钥 base64.RawURLEncoding（admin 签发 keypair 时

生成，私钥仅服务端使用）

- `sid`：short_id（hex，0-8 字符），admin 可配多个 sid 池让客户端按 inbound

分散

- `sni`：客户端 ClientHello 里写的伪装 server_name，必须命中节点 REALITY

ServerNames 白名单。GFW 看到的是与真实大站握手前缀完全一致的 TLS 流量

- `spx`：SpiderX 路径，默认 `/`
- `flow=xtls-rprx-vision`：REALITY 必须配套 xtls-rprx-vision 流控

**客户端兼容性**：

| 客户端 | REALITY 支持 | 备注 |
| --- | --- | --- |
| sing-box (CLI / GUI) | ≥ v1.4 | 原生支持 |
| v2rayN (Windows) | ≥ v6.x | 订阅链接直接识别 `security=reality` |
| Clash Verge | ≥ v1.4 (含 Mihomo) | REALITY 节点编辑器原生 |
| Shadowrocket (iOS) | ≥ v2.2.21 | 订阅识别 |
| NekoBox / NekoRay | ≥ v1.2 | 订阅识别 |
| 老版本客户端 | ✗ | 拉订阅时跳过 REALITY 节点；admin 可对同一组节点同时配传统 TLS + REALITY 两套 inbound，让老客户端 fallback 到 TLS |

**何时启用 REALITY**：

- ISP 干扰 vless+TLS 流量（典型表现：握手后立刻 RST / 长时间黑洞）
- 节点 PublicIP 被流量分析模型标记为 VPN 出口
- 需要节点流量与真实大站握手前缀完全一致，绕过 SNI 白名单检测

不启用 REALITY 时走传统 vless+TLS 链路（节点 cert pipeline 自动签发的 `<node>.<root>` cert + 客户端 strict TLS verify），更省 CPU 一点点；REALITY 握手有额外计算成本但稳定性更好。

### 5.3 拨号节点池规则

§5.2 拨号无论用哪种用法（地区拨号 / 智能拨号 / 全球均衡）：

- 节点池 = 商户绑定的节点组
- 同一节点上多协议算一个节点；`links[]` 数组承载所有协议链接
- 返回的节点已经通过平台健康度筛选，业务方按 `score` 倒序使用即可

## 6. 流量对账

**摘要**：

```bash
curl -fsS "${HOST}/v1/proxy/customers/traffic/summary?since=2026-05-01&until=2026-05-17" "${HDRS[@]}" | jq .
```

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `since` | string (date) | 否 | 起始日期 `YYYY-MM-DD`；默认本月 1 号 |
| `until` | string (date) | 否 | 结束日期（不含）；默认今天 |
| `customer_id` | string | 否 | 指定顾客；不传 = 商户聚合 |
| `granularity` | enum | 否 | `day` / `month`；默认 `day` |

**响应字段**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `total_bytes` | int | 区间总用量（字节） |
| `total_up_bytes` | int | 上行 |
| `total_down_bytes` | int | 下行 |
| `merchant_quota_bytes` | int | 商户本期总配额 |
| `merchant_used_bytes` | int | 商户本期已用 |
| `merchant_remaining_bytes` | int | 剩余 = quota - used |
| `series[]` | array | 按 `granularity` 切分的用量数组（含 `date` / `bytes`） |

**CSV 导出**：

```bash
curl -fsS "${HOST}/v1/proxy/customers/traffic/export?since=2026-05-01&until=2026-05-17" "${HDRS[@]}" -o customer-traffic.csv
```

CSV 列：`date,customer_id,username,bytes_up,bytes_down,total_bytes,node_id,region`。

**约束**：商户自身购买的总流量不能小于其下顾客套餐流量总和。包月商户有级联到期：顾客有自己的可见到期时间，同时还有受商户套餐约束的实际服务截止时间；哪个先到，服务就停止。

## 7. 商户后台 API 面

商户后台和商户后端都复用 `/v1/*`，没有单独的 `/api/merchant/*` 命名空间；可访问面由登录身份、SDK Key owner、scope、IP 白名单共同收敛。

| 能力 | 路径 | 方法 | 说明 |
| --- | --- | --- | --- |
| 登录 | `/v1/auth/login` | POST | 返回 `access_token` + `csrf_token`；写操作必须带 csrf |
| 登出 | `/v1/auth/logout` | POST | 清除 session |
| 修改密码 | `/v1/auth/password` | POST | 旧密码 + 新密码 |
| MFA 绑定 | `/v1/auth/mfa/enroll` | POST | 启动 MFA 注册流程 |
| MFA 确认 | `/v1/auth/mfa/confirm` | POST | 提交 6 位动态码完成绑定 |
| MFA 解绑 | `/v1/auth/mfa/disable` | POST | 需要当前 MFA 码 |
| 当前商户信息 | `/v1/proxy/merchants/{id}` | GET | 含套餐 / 流量 / 子账号汇总 |
| 子账号列表 / 创建 | `/v1/proxy/merchants/{id}/sub-accounts` | GET / POST | 子账号继承父账号权限子集 |
| 删除子账号 | `/v1/proxy/merchants/{id}/sub-accounts/{child_id}` | DELETE | 立即生效 |
| SDK Key 列表 | `/v1/platform/sdk-keys` | GET | 当前商户的所有 Key（secret 已脱敏） |
| 轮换 / 吊销 SDK Key | `/v1/platform/sdk-keys/{key_id}/{rotate,revoke}` | POST | rotate 返回一次新 secret |

### 7.1 商户自查（配额 / 用量 / 对接能力）

`{id}` = 商户自己的 ID；merchant 登录态 / SDK Key 自动限定本商户。

```bash
curl -fsS "${HOST}/v1/proxy/merchants/mch_xxx" "${HDRS[@]}" | jq .
```

响应（`merchant` 下商户自查最常用字段）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `merchant.plan_type` | enum | 商户平台计费维度 `duration` / `traffic` |
| `merchant.plan_traffic_quota_bytes` | int | 流量套餐总配额（字节）；`0` / 空 = 不限 |
| `merchant.plan_traffic_used_bytes` | int | 已**消耗**流量（后端按顾客实际用量计费维护） |
| `merchant.plan_traffic_allocated_bytes` | int | 已**分配**给顾客的流量额度之和（= 各顾客 `data_limit_bytes` 求和）。仅流量套餐商户的**单商户详情**响应里返回（列表不算） |
| `merchant.plan_traffic_remaining_bytes` | int |**剩余可分配流量**= `max(0, quota − allocated)`。开顾客自主填流量的上限：新顾客 `data_limit_bytes` ≤ 本值，超出后端硬拦（`proxy.merchant.traffic_quota.exceeded`）；开一个顾客 allocated 增、本值降（"自动减"）。仅流量套餐单商户详情返回 |
| `merchant.plan_user_quota` | int | 用户数上限（duration 维度）；`0` = 不限 |
| `merchant.plan_expires_at` | string (RFC3339) | 商户套餐到期 |
| `merchant.customer_plan_codes` | array<string> | 可绑给顾客的套餐 code 集合（创建顾客 `next_plan_ref` 的来源） |
| `merchant.api_enabled` / `merchant.sdk_enabled` | bool | 商户对接能力开关（有效值，存量 grandfather 为开） |
| `customer_count` | int | 当前顾客总数 |

> 商户用它自查「还能开几个顾客 / 流量还剩多少 / 套餐何时到期」，在配额耗尽前主动续费。**级联**：商户套餐到期或流量耗尽时，其下顾客即使未到期也会停服（见 §6）。逐日用量明细走 §6 流量对账。

### 7.2 子账号 / 多级分销

商户可建子账号（子代理），继承父商户权限子集；`{id}` = 父商户 ID。

**创建子账号**：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/merchants/mch_parent/sub-accounts" "${HDRS[@]}" -d '{
 "login_username": "agent01",
 "name": "华东代理",
 "customer_plan_codes": ["100g_lifetime"],
 "can_view_parent_customers": false
}' | jq .
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `login_username` | string | 否 | 子账号后台登录名；留空自动生成 `sub-<id>` |
| `login_password` | string | 否 | 子账号登录密码；留空自动生成（响应一次性回显） |
| `name` | string | 否 | 子账号展示名 |
| `customer_plan_codes` | array<string> | 否 | 分给子账号可售的顾客套餐 code（应为父商户已有 codes 的子集） |
| `can_view_parent_customers` | bool | 否 | 是否允许该子账号查看父商户的顾客；默认 `false` |
| 其它 `MerchantUpsertRequest` 字段 | — | 否 | `plan_type` / `api_host` / `sub_host` / `max_up_mbps` 等，语义同建商户 |

> `parent_merchant_id` 由路径 `{id}` 强制写入（body 传了也被覆盖，防伪造）；子账号继承父商户的 tenant。响应含**一次性凭据**：`login_username` / `login_password`（明文仅此一次）+ `sdk_key` / `sdk_key_secret`——立即转交子代理并保存，离开页面不可再查。

**列出子账号**：`GET /v1/proxy/merchants/{id}/sub-accounts`**删除子账号**：`DELETE /v1/proxy/merchants/{id}/sub-accounts/{child_id}`（立即生效）

### 7.3 商户限速套餐管理（P0b owner 2026-06-02）

商户内部 Mbps 限速分档套餐管理。承 owner 拍板「商户限速权威口径」：

- **平台合同上限**：`merchant.bandwidth_cap_mbps`（平台开通商户时设置，admin only，商户不可自调）
- **商户内部套餐**：`merchant_bandwidth_plan.max_mbps`（商户自治，但必须 ≤ merchant.cap）
- **顾客有效限速**：来自顾客绑定的 `current_bandwidth_plan_ref`；空时 fallback merchant.cap

> 商户 API 不暴露顾客 Mbps 字段（不能在 `POST /v1/proxy/customers` 设置 `max_up_mbps`，已弃用）。要让顾客有限速，建商户套餐并把顾客 `current_bandwidth_plan_ref` 绑过来。

**创建/更新套餐**（商户自家自动推断 merchant_id；admin/tenant 必填）：

```bash
curl -fsS -X POST "${HOST}/v1/proxy/merchant-bandwidth-plans" "${HDRS[@]}" -d '{
 "name": "PRO 100Mbps",
 "max_up_mbps": 100,
 "max_down_mbps": 100,
 "data_limit_bytes": 107374182400,
 "validity_seconds": 2592000,
 "online_ip_limit": 5,
 "allowed_inbound_tags": ["vless_tier_100m"],
 "status": "active"
}'
```

返回 200 + `{ id, merchant_profile_id, name, max_up_mbps, max_down_mbps, ... }`。

**校验**：

- `max_up_mbps / max_down_mbps` 必须 ≤ `merchant.max_up_mbps / max_down_mbps`（cap），超 → 400 `proxy.merchant_bandwidth_plan.up_mbps.exceeds_merchant_cap`
- 0 = 未设置（继承 merchant cap），非 0 必须在 cap 之内

**列套餐**：`GET /v1/proxy/merchant-bandwidth-plans`（商户自家），admin 加 `?merchant_id=mp-xxx`。返回 `{ merchant_profile_id, plans: [...] }`。

**单个套餐**：`GET /v1/proxy/merchant-bandwidth-plans/{id}`。商户读别人套餐 → 403。

**删除套餐**：`DELETE /v1/proxy/merchant-bandwidth-plans/{id}`。**引用拒删**：若有顾客 `current_bandwidth_plan_ref` 还在引用此 plan，返 400 `proxy.merchant_bandwidth_plan.in_use: user=X still references plan=Y`，必须先把顾客切到其他 plan（或清空 `current_bandwidth_plan_ref` 走 fallback）。

**字段语义**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 套餐名（必填） |
| `max_up_mbps` | int | 上行 Mbps（0 = 未设，继承 merchant cap；非 0 必须 ≤ merchant cap） |
| `max_down_mbps` | int | 下行 Mbps（同上） |
| `data_limit_bytes` | uint64 | 流量额度（独立维度，可选） |
| `validity_seconds` | int | 有效期秒数（可选） |
| `online_ip_limit` | int | 同时在线设备上限（可选） |
| `allowed_protocols` | string[] | 协议可见性（可选，承载顾客订阅过滤） |
| `allowed_inbound_tags` | string[] | 入站 tag 可见性（可选，**承载 vless tier routing**P2） |
| `status` | enum | `active` / `disabled` |
| `note` | string | 备注 |

**顾客绑套餐**：在 `POST /v1/proxy/customers` 传 `current_bandwidth_plan_ref: "<plan_id>"`(立即生效)。**预约下期切换**:传 `next_bandwidth_plan_ref: "<plan_id>"` —— 到期边界续期调度器自动 promote 成 current 并清空(一次性,正交于销售套餐 `next_plan_ref` 续期)。立即改速档直接设 `current_bandwidth_plan_ref` 即可,无需 next。

顾客有效限速从 `customer.bandwidth_policy` 读，`source=merchant_plan` + `source_ref=plan_id`；空 plan 时 `source=merchant_cap_default`。

### 7.4 商户合同 Bandwidth Cap（admin only）

平台开通商户时设置 `merchant.bandwidth_cap_mbps`。商户不可自调；admin 改时若有 `plan.max > newCap`，**强校验拒绝**，逼 admin 先让商户调整 over-cap plan。

```bash
# admin 查
curl -fsS "${HOST}/v1/admin/proxy/merchants/${MERCHANT_ID}/bandwidth-cap" "${ADMIN_HDRS[@]}"

# admin 改
curl -fsS -X PUT "${HOST}/v1/admin/proxy/merchants/${MERCHANT_ID}/bandwidth-cap" "${ADMIN_HDRS[@]}" -d '{
 "max_up_mbps": 200,
 "max_down_mbps": 200
}'
```

**响应**：`{ merchant_profile_id, max_up_mbps, max_down_mbps }`。

**下调校验失败**：`400 proxy.merchant.cap_up_mbps.lower_blocked_by_plan: plan=mbp-xxx plan_max=100 new_cap=50`（列出 over-cap plan ID，admin 通知商户先调）。

## 8. 错误包络

WireRaw 错误响应使用机器码：

```json
{"error":"auth.sdk_key.unauthorized"}
```

**常见错误码**：

| HTTP | 错误码 | 触发条件 | 处理建议 |
| --- | --- | --- | --- |
| 400 | `json: unknown field ...` | 请求字段后端不认识 | 检查表单 / SDK 版本；可能字段名拼写错或 SDK 太旧 |
| 400 | `proxy.customer_plan.not_allowed_for_merchant` | 套餐未绑定给该商户 | 先查 `/v1/proxy/customer-plans` 拿到允许的 `code`；不要硬抄其他商户的 code |
| 400 | `validation.failed` | 字段类型 / 长度 / enum不合法 | 看 error.message 里的字段名修正 |
| 400 | `proxy.customer.subscription.extend_empty` | 续期请求 `expires_at` / `validity_seconds` / `additional_bytes` 全空 | 至少传一项（绝对到期 / 相对续期 / 加量） |
| 401 | `auth.sdk_key.unauthorized` | Key ID / Secret 错误、过期或已吊销 | 商户后台 → SDK Keys 查 key 状态；必要时轮换 |
| 403 | `auth.sdk_key.ip_forbidden` | 商户后端出口 IP 不在白名单 | 后台编辑 SDK Key 增加 IP；CI 环境注意出口 IP 漂移 |
| 403 | `auth.sdk_key.scope_forbidden` | Key scope 不足 | 创建带更宽 scope 的新 Key；不建议把所有 Key 都开成全 scope |
| 403 | `auth.scope.forbidden` | 访问了别的商户 / 租户资源 | 检查 `customer_id` / `merchant_id` 是不是自己的；商户互相隔离 |
| 403 | `proxy.subscription.merchant_inactive` | 商户套餐到期或流量耗尽 | 续费 / 加配；顾客即使未到期也会停服 |
| 404 | `*.not_found` | 资源不存在或不在当前商户范围 | 检查 ID；列表接口先验证 |
| 409 | `conflict` | upsert 冲突（如同 `username` 创建两次） | 重试带相同 `id` 走更新；或先查老顾客是否已存在（同 `username` 不会重复创建） |
| 412 | `bump.required` | 客户端 SDK 版本过旧 | 升级 SDK / 客户端到最新 |
| 429 | `*.rate_limited` | 触发限流 | 退避后重试；`Retry-After` 给秒数；高并发场景预先与平台约定配额 |
| 500 | `internal.unknown` | 服务端异常 | 记录 `request_id` 后联系平台 |

**排查顺序**：

1. 确认域名是控制中心 API 域名，且走 HTTPS。
2. 确认同时传了 `X-Wireraw-Key-ID` 和 `X-Wireraw-Key-Secret`。
3. 在商户后台确认 Key 未撤销、未过期、IP 白名单包含商户后端出口 IP。
4. 创建顾客前先查 `/v1/proxy/customer-plans`，只使用返回的套餐 `code`。
5. 顾客详情没有 `subscription_url` 时，先查顾客状态、商户套餐是否到期、订阅是否撤销。
6. 需要平台协助时，提供请求时间、Key ID、顾客 ID、HTTP status 和 `error` 机器码。

## 9. 注意事项

- **顾客主键用 `end_user.id`。**`username` 适合展示和商户侧查询；跨系统回调、停用、续期、撤销订阅建议保存 `id`。
- **订阅地址必须在详情可见。**列表可以省略重字段，但详情必须返回 `subscription_url`、可用格式和入站协议。
- **协议由节点入站和顾客凭据共同决定。**顾客使用的协议范围由套餐绑定 + 节点入站交集自动确定。
- **商户套餐级联。**商户包月到期或流量耗尽时，顾客即使未到期也会停止服务。先看 `merchant_remaining_bytes`，再做续费决策。
- **SDK Key 与后台账号不是同一回事。**SDK Key 适合机器对机器；后台账号适合人工登录、MFA、密码策略和审计。
- **写幂等靠 `id` / `username`，不是 `Idempotency-Key`。**平台当前未实现通用 `Idempotency-Key` 去重（发了会被忽略）。创建顾客重试时带**相同 `id`**= 更新而非重复创建；同 `username` 重复创建直接 409。网络抖动重试前，请用固定 `id` 或能接受 409。（如需真正的服务端 Idempotency-Key 重试去重，是独立功能，需另行排期。）
- **审计可追溯。**所有写操作进入审计流（`proxy.customer.upsert` / `subscription.revoke` 等），事故定责依赖 `actor.username` / `actor.ip`。
