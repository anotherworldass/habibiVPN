# WireRaw 商户 SDK 接入文档

> 本文给出商户 SDK 接入方式 + 多语言完整 demo（curl / PHP / Node.js / Python / Go）。完整 API 字段契约见左侧「API 接口」标签页；错误码 在该标签页 §8。**本文档 = API 接入 SDK**（你的**后端**调控制面 HTTP API 做运维 / 计费 / 顾客管理）。**嵌进你 App 的「设备上 VPN 客户端 SDK」是另一套**（hy2/vless 数据面，Rust 核 + C/.NET/JVM/Android/iOS 绑定，由 WireRaw 以交付包给你的 App 团队），**不在此文**—— 见 §2。

## 1. SDK 接入策略

SDK 是 API client，**不是鉴权边界**。移动端 / 桌面端 / 网页前端绝对不能保存商户 SDK Key —— 这是长期服务端密钥，泄露立即视为完全失控。

推荐三层架构：

```text
顾客 App → 商户后端鉴权（OAuth / 手机号 / 邮箱）
商户后端 → WireRaw /v1/proxy/* （持有 SDK Key）
商户后端 → 返回 subscription_url / dial 候选给 App
App / 系统 VPN → 消费 subscription_url 或 sing-box 配置
```

如果商户没有后端，**不要**把 SDK Key 打进 App；改用顾客订阅链接派发模式（每顾客一条 `subscription_url`，撤销立即失效）。

## 2. 仓内 SDK 与多语言 demo 一览

> **⚠️ 两套 SDK，用途不同，别混淆**： -**① API 接入 SDK（本文档）**：你的**后端**调控制面 HTTP API（列套餐 / 建顾客 / 派发订阅 / 计费）。仓内**唯一全平台 API SDK**是 Go（`sdk/`），随 `api/openapi.yaml` 契约 lockstep；其它语言（Python / TypeScript）是**API 接入 demo**（演示如何打 HTTP API，放 `examples/`，独立演进）。SDK Key 是长期服务端密钥，**只在后端用，绝不进 App**（见 §1）。 -**② 端上客户端 SDK（另一套，本文档不涉）**：嵌进你**App**的**设备上 VPN 客户端库**（hy2/vless 数据面），Rust 核 + **C / C# (.NET) / Java / Kotlin (Android) / Swift (iOS)**绑定，日期轴版本，由 WireRaw 以交付包（含各平台库 + 集成 demo）给你的**App 团队**。它跑数据面、不调本文这些管理 API。

| 语言 | 路径 | 性质 | 适用场景 |
| --- | --- | --- | --- |
| Go | `sdk/` | ✅ 全平台 SDK | 服务端 / CI / 运维脚本；类型完整、随契约 lockstep |
| TypeScript | `examples/typescript/` | API 接入 demo | Web 管理端 / Node 后端骨架 |
| Python | `examples/python/` | API 接入 demo | 数据 / CRM 脚本 / 自动化对账骨架 |

未提供仓内示例的语言（PHP / Java / Ruby / C#）按本文档 §4 给出的 HTTP 调用规则自行实现 — 控制中心是标准 REST + JSON，任何 HTTP 客户端都可对接。

## 3. 鉴权与公共请求头

所有 `/v1/proxy/*` 请求必带两个头：

| 头 | 内容 |
| --- | --- |
| `X-Wireraw-Key-ID` | 商户 SDK Key ID（如 `sdk_xxx`） |
| `X-Wireraw-Key-Secret` | 配对 Secret（**只在创建 / 轮换时显示一次**） |
| `Content-Type` | `application/json`（POST/PUT/PATCH 必须） |

**推荐附加头**：

| 头 | 用途 |
| --- | --- |
| `X-Request-ID` | 客户端生成的 UUID；与响应 `request_id` 配对，便于排障 |
| `Idempotency-Key` | 写操作幂等；24h 窗口内同 key 返回同结果，避免重复扣量 |

## 4. 多语言完整 demo

下面 5 种语言的示例都覆盖同一个流程：**列套餐 → 创建顾客 → 查询顾客 → 撤销订阅**（4-call）。把环境变量 `WIRERAW_HOST` / `WIRERAW_KEY_ID` / `WIRERAW_KEY_SECRET` 换成真实值即可跑。

> 示例用 `next_plan_ref`（套餐）开户；也可以**不选套餐**，把创建顾客那步的 `next_plan_ref` 换成 `expire_at`（RFC3339 绝对到期，如 `"2026-07-01T18:30:00Z"`）或 `validity_seconds`（相对秒数）。优先级 `expire_at` > `validity_seconds` > `next_plan_ref`，字段说明见 MERCHANT_API.zh.md §4.2。

### 4.1 curl（最小可用）

```bash
#!/usr/bin/env bash
set -euo pipefail
HOST="${WIRERAW_HOST:-https://demo-cont.wireraw.com}"
KEY_ID="${WIRERAW_KEY_ID}"
KEY_SECRET="${WIRERAW_KEY_SECRET}"
HDRS=(
 -H "X-Wireraw-Key-ID: ${KEY_ID}"
 -H "X-Wireraw-Key-Secret: ${KEY_SECRET}"
 -H "Content-Type: application/json"
)

# 1. 列可售套餐
curl -fsS "${HOST}/v1/proxy/customer-plans" "${HDRS[@]}" | jq .

# 2. 创建顾客
CREATE_RESP=$(curl -fsS -X POST "${HOST}/v1/proxy/customers" "${HDRS[@]}" -d '{
 "username": "alice-001",
 "next_plan_ref": "100g_lifetime"
}')
CUSTOMER_ID=$(echo "${CREATE_RESP}" | jq -r .end_user.id)
SUB_URL=$(echo "${CREATE_RESP}" | jq -r .subscription_url)
echo "customer_id=${CUSTOMER_ID}"
echo "subscription_url=${SUB_URL}"

# 3. 查询顾客
curl -fsS "${HOST}/v1/proxy/customers/${CUSTOMER_ID}" "${HDRS[@]}" | jq .

# 4. 撤销订阅
curl -fsS -X POST "${HOST}/v1/proxy/customers/${CUSTOMER_ID}/subscription/revoke" "${HDRS[@]}"
```

### 4.2 PHP（cURL 扩展）

```php
<?php
// composer 无依赖，仅用 php-curl 扩展。PHP ≥ 7.4 即可。

const WIRERAW_HOST = 'https://demo-cont.wireraw.com';
const WIRERAW_KEY_ID = 'sdk_xxx';
const WIRERAW_KEY_SECRET = 'sdk_secret_xxx';

function wireraw_call(string $method, string $path, ?array $body = null): array {
 $ch = curl_init(WIRERAW_HOST . $path);
 curl_setopt_array($ch, [
 CURLOPT_RETURNTRANSFER => true,
 CURLOPT_CUSTOMREQUEST => $method,
 CURLOPT_HTTPHEADER => [
 'X-Wireraw-Key-ID: ' . WIRERAW_KEY_ID,
 'X-Wireraw-Key-Secret: ' . WIRERAW_KEY_SECRET,
 'Content-Type: application/json',
 'X-Request-ID: ' . bin2hex(random_bytes(8)),
 ],
 CURLOPT_TIMEOUT => 15,
 ]);
 if ($body !== null) {
 curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
 }
 $raw = curl_exec($ch);
 $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
 curl_close($ch);
 if ($raw === false) {
 throw new RuntimeException('curl error');
 }
 $decoded = json_decode($raw, true);
 if ($code >= 400) {
 throw new RuntimeException("HTTP {$code}: " . ($decoded['error'] ?? $raw));
 }
 return $decoded ?? [];
}

// 1. 列套餐
$plans = wireraw_call('GET', '/v1/proxy/customer-plans');
print_r($plans);

// 2. 创建顾客
$created = wireraw_call('POST', '/v1/proxy/customers', [
 'username' => 'alice-001',
 'next_plan_ref' => '100g_lifetime',
]);
$customerId = $created['end_user']['id'];
echo "customer_id={$customerId}\n";
echo "subscription_url={$created['subscription_url']}\n";

// 3. 查询
$detail = wireraw_call('GET', "/v1/proxy/customers/{$customerId}");

// 4. 撤销订阅
wireraw_call('POST', "/v1/proxy/customers/{$customerId}/subscription/revoke");
```

### 4.3 Node.js（原生 fetch / Node 18+）

```javascript
// 无 npm 依赖；Node ≥ 18 自带 fetch。CommonJS 风格，可直接保存为 demo.js 跑。

const HOST = process.env.WIRERAW_HOST || 'https://demo-cont.wireraw.com';
const KEY_ID = process.env.WIRERAW_KEY_ID;
const KEY_SECRET = process.env.WIRERAW_KEY_SECRET;

async function wirerawCall(method, path, body) {
 const headers = {
 'X-Wireraw-Key-ID': KEY_ID,
 'X-Wireraw-Key-Secret': KEY_SECRET,
 'Content-Type': 'application/json',
 'X-Request-ID': crypto.randomUUID(),
 };
 const init = { method, headers };
 if (body !== undefined) init.body = JSON.stringify(body);
 const resp = await fetch(HOST + path, init);
 const text = await resp.text();
 const data = text ? JSON.parse(text) : {};
 if (!resp.ok) {
 throw new Error(`HTTP ${resp.status}: ${data.error || text}`);
 }
 return data;
}

(async () => {
 // 1. 列套餐
 const plans = await wirerawCall('GET', '/v1/proxy/customer-plans');
 console.log('plans', plans);

 // 2. 创建顾客
 const created = await wirerawCall('POST', '/v1/proxy/customers', {
 username: 'alice-001',
 next_plan_ref: '100g_lifetime',
 });
 const customerId = created.end_user.id;
 console.log('customer_id', customerId);
 console.log('subscription_url', created.subscription_url);

 // 3. 查询
 await wirerawCall('GET', `/v1/proxy/customers/${customerId}`);

 // 4. 撤销订阅
 await wirerawCall('POST', `/v1/proxy/customers/${customerId}/subscription/revoke`);
})().catch((err) => {
 console.error(err);
 process.exit(1);
});
```

### 4.4 Python（requests）

```python
# pip install requests
import os, uuid, requests

HOST = os.environ.get("WIRERAW_HOST", "https://demo-cont.wireraw.com")
KEY_ID = os.environ["WIRERAW_KEY_ID"]
KEY_SECRET = os.environ["WIRERAW_KEY_SECRET"]

def call(method: str, path: str, body=None):
 headers = {
 "X-Wireraw-Key-ID": KEY_ID,
 "X-Wireraw-Key-Secret": KEY_SECRET,
 "Content-Type": "application/json",
 "X-Request-ID": uuid.uuid4().hex,
 }
 r = requests.request(method, HOST + path, json=body, headers=headers, timeout=15)
 if r.status_code >= 400:
 raise RuntimeError(f"HTTP {r.status_code}: {r.text}")
 return r.json() if r.content else {}

# 1. 列套餐
plans = call("GET", "/v1/proxy/customer-plans")
print("plans", plans)

# 2. 创建顾客
created = call("POST", "/v1/proxy/customers", {
 "username": "alice-001",
 "next_plan_ref": "100g_lifetime",
})
customer_id = created["end_user"]["id"]
print("customer_id", customer_id)
print("subscription_url", created["subscription_url"])

# 3. 查询
call("GET", f"/v1/proxy/customers/{customer_id}")

# 4. 撤销订阅
call("POST", f"/v1/proxy/customers/{customer_id}/subscription/revoke")
```

### 4.5 Go（仓内 SDK）

```go
package main

import (
 "context"
 "fmt"
 "log"
 "os"

 wireraw "github.com/wireraw/wireraw-vpn/sdk"
)

func main() {
 ctx := context.Background()
 client, err := wireraw.New(wireraw.Config{
 BaseURL: os.Getenv("WIRERAW_HOST"),
 KeyID: os.Getenv("WIRERAW_KEY_ID"),
 KeySecret: os.Getenv("WIRERAW_KEY_SECRET"),
 })
 if err != nil {
 log.Fatal(err)
 }

 // 1. 列套餐
 plans, err := client.Proxy().ListCustomerPlans(ctx)
 if err != nil {
 log.Fatal(err)
 }
 fmt.Printf("plans %+v\n", plans)

 // 2. 创建顾客
 created, err := client.Proxy().UpsertCustomer(ctx, wireraw.CustomerInput{
 Username: "alice-001",
 NextPlanRef: "100g_lifetime",
 })
 if err != nil {
 log.Fatal(err)
 }
 fmt.Println("customer_id", created.EndUser.ID)
 fmt.Println("subscription_url", created.SubscriptionURL)

 // 3. 查询
 if _, err := client.Proxy().GetCustomer(ctx, created.EndUser.ID); err != nil {
 log.Fatal(err)
 }

 // 4. 撤销订阅
 if err := client.Proxy().RevokeSubscription(ctx, created.EndUser.ID); err != nil {
 log.Fatal(err)
 }
}
```

## 5. App / 客户端拨号接入

App 端不持有 SDK Key —— 走商户后端中转：

```text
App --[商户 token]--> 商户后端
商户后端 --[SDK Key]--> /v1/proxy/dial → 返回 best node + candidates
商户后端 → 把 subscription_url 或 sing-box JSON 返给 App
App / 系统 VPN → 喂给 sing-box / Clash / 自研 transport 内核
```

如果未来确需 App 直连控制中心，应新增**短期顾客 token 交换接口**（基于 `subscription_url` 颁发 5min token），不要复用长期商户 SDK Key。

## 6. 错误处理 & 重试

- HTTP 4xx 是契约性错误 — 看 `error` 字段（机器码，例 `auth.sdk_key.unauthorized`），不要盲目重试。
- HTTP 5xx 与 429 可重试 — 用指数退避，并带 `Idempotency-Key`（避免重试时被当成新请求）。
- 推荐：写操作必带 `Idempotency-Key`，24h 窗口幂等。
- 完整错误码清单见左侧「API 接口」标签页 §8。

## 7. 安全注意事项

- 商户 SDK Key Secret**只在创建 / 轮换时显示一次**；落地后请马上写入 KMS / Vault / CI Secret，文件权限 0600。
- 绑定**IP 白名单**+ 最小**scope**— 限制到商户后端出口 IP 和实际需要的资源面。
- 怀疑泄露：商户后台立即吊销旧 Key、轮换新 Key、更新后端密钥并 reload 服务。曾经打包进 App 的版本视为全泄露，必须强制升级。
- 移动端 / 桌面端 / 网页前端**绝不存放**SDK Key；用顾客订阅链接派发模式。
- 审计与定责：所有写操作进入审计流（`proxy.customer.upsert` / `subscription.revoke` 等），事故定责依赖 `actor.username` / `actor.ip`。

## 8. SDK v2 终端客户端架构

**用例**：商户要把 wireraw 接入面集成到自己的 App / 桌面客户端，让用户**不经过商户后端**直接和控制面握手获取 connection plan。

**与本文 §1-7 关系**：本节是 §1-7 的*独立轨道*。§1-7 SDK Key 适用于"商户后端 ↔ 控制面"长连接；本节适用于"商户 App ↔ 控制面"短期面。商户两个都要：后端管账户，App 跑连接。

### 8.1 角色和密钥分离

| 角色 | 凭据 | 寿命 | 持有方 |
| --- | --- | --- | --- |
| 商户后端（§1-7） | SDK Key Secret | 永久（手动轮换） | 商户后端 KMS / Vault |
| `merchant_apps` 注册 | (无 Secret；只是分类) | — | 控制面后台数据 |
| Bootstrap manifest | Ed25519 签名 | 24h（manifest TTL） | 控制面签发，CDN 托管 |
| wrsdk token | Opaque Ed25519 签 | 15min | SDK 内存 |
| 顾客订阅 token | hex 24B | 永久（撤销重发） | SDK / 用户 |

### 8.2 商户运维步骤

**1. 注册 App（一次性）**

```bash
# admin / merchant 自身均可调
curl -X POST $CTRL/v1/proxy/merchants/$MID/apps \
 -H "Authorization: Bearer $TOKEN" \
 -d '{
 "app_id": "com.example.app",
 "platform": "android",
 "name": "Example VPN",
 "status": "active",
 "bootstrap_urls": [
 "https://cdn1.example.com/wireraw/manifest.json",
 "https://cdn2.example.com/wireraw/manifest.json"
 ],
 "min_sdk_version": "20260617.1",
 "force_upgrade_below": "20260601.1",
 "allowed_capabilities": ["signed_manifest","dynamic_token","multi_candidate","race"]
 }'
```

**2. 拉签名公钥**

```bash
curl -X GET $CTRL/api/sdk/bootstrap/public-key
# → { "key_id": "abc...", "public_key_base64": "...", "algorithm": "ed25519" }
```

**3. 拉一份签名 manifest，上传到 3-8 个 CDN**

```bash
curl -X POST $CTRL/v1/proxy/merchants/$MID/apps/$APP_UID/manifest/sign \
 -H "Authorization: Bearer $TOKEN" \
 -o manifest.json
# 把 manifest.json 上传到 bootstrap_urls 里登记的每个 CDN。
# manifest 默认 TTL 24h；建议自动化每 12h 重签 + 重上传。
```

**4. 在 App ship 一份 `wireraw-sdk.json`**

```json
{
 "merchant_code": "mp_xxxxx",
 "app_id": "com.example.app",
 "bootstrap_urls": [
 "https://cdn1.example.com/wireraw/manifest.json",
 "https://cdn2.example.com/wireraw/manifest.json"
 ],
 "pinned_public_keys": [
 "<上一步拿到的 public_key_base64>"
 ],
 "sdk_version": "20260617.1",
 "device_id": "<App 内 mint，建议 install-time 持久化>"
}
```

`pinned_public_keys` 多个时 SDK 校验通过任一即可（密钥轮换期共存）。

### 8.3 SDK 启动期流程（SDK v2 自动）

```
App 启动
 → SDK 读 wireraw-sdk.json
 → 并发抓所有 bootstrap_urls 的 manifest
 → Ed25519 校验签名（pinned_public_keys 任一通过）
 → 取 version 最大的 manifest
 → POST <panel_base>/api/sdk/exchange
 { merchant_id, app_id, device_id, sdk_version, bootstrap_nonce, manifest_version }
 → 响应 wrsdk_token + sdk_policy.action ∈ {ok, warn, force_upgrade, blocked}
 - blocked：启动失败，引导用户升级 App
 - force_upgrade：可启动但 UI 显式提示强升
 - warn：可启动，弱提示
 - ok：正常进入
 → POST <panel_base>/api/sdk/dial Bearer wrsdk_token
 → connection plan: { primary, candidates, policy.strategy/priority/race_parallelism, ttl_seconds }
 → SDK 按 plan.policy.strategy 跑 single/fallback/race
 → 连接失败 POST <panel_base>/api/sdk/report Bearer wrsdk_token
```

### 8.4 Go 端示例

```go
import "github.com/wireraw/wireraw-vpn/sdk/sdkv2"

cfg, err := sdkv2.LoadConfig("/etc/wireraw-sdk.json")
client, err := sdkv2.New(cfg)
err = client.Start(ctx) // 抓 manifest + 拿 token；err 含 ErrSDKPolicyBlocked

plan, err := client.GetConnectionPlan(ctx, sdkv2.DialRequest{})
// plan.Primary / plan.Candidates → 你的 sing-box / tunnel core
strat := sdkv2.Strategy{Plan: plan}
winner, outcomes, err := strat.Run(ctx, func(ctx context.Context, cand sdkv2.DialCandidate) error {
 return mySingboxConnect(ctx, cand.Node)
})

// 失败上报（fire-and-forget）
for _, o := range outcomes {
 if o.Err != nil {
 client.ReportFailure(ctx, sdkv2.FailureReport{
 NodeID: fmt.Sprint(o.Candidate.Node["id"]),
 Stage: "connect", Error: o.Err.Error(),
 })
 }
}
```

### 8.5 已知边界

- **顾客凭据自动 mint**：`/api/sdk/exchange` 时若 (merchant, device_id) 无对应顾客 → 服务端按 merchant 默认套餐 mint `sdk_<24hex>` 顾客并 mint PrimaryUUID / PrimaryPassword；后续 `/api/sdk/dial` 在 `candidates[].links` 内嵌完整 vless:// / hy2:// 等 URI（与 §1-7 订阅链接 URI 同构）。商户后台 / portal 看顾客列表时这类 device-bound 用户 `note` 字段标 `sdk_auto_mint device=...`。
- **iOS / Android Native**：当前只有 Go SDK；Stage C 独立排期，采纳 sing-box libcore vendor + 自家 Swift/Kotlin bridge（A4=a）。
- **Nonce 防重放**：当前 manifest 用 `expires_at` + 签名兜底；规模化后再视情况加 Redis 黑名单。

### 8.6 撤销已 mint 的 wrsdk token

事故响应或密钥怀疑泄露场景，admin / merchant 自身可对某个 App 批量撤销 所有已 mint 的 wrsdk token：

```bash
curl -X POST $CTRL/v1/proxy/merchants/$MID/apps/$APP_UID/revoke-tokens \
 -H "Authorization: Bearer $TOKEN"
# → 返回 MerchantAppView 含 tokens_invalid_before_at = 当前时间
```

服务端会把 MerchantApp.tokens_invalid_before_at 推到当前时刻，所有早于 该时间签发的 wrsdk token 在下次 dial / report 校验时返回 401 `sdk_token.revoked`。SDK 客户端 (sdkv2) 收到这个 errcode 后会**自动**清 token 缓存 + 重新走 /api/sdk/exchange 拿新 token + 重试一次失败的 请求（N3=b 决策）。即所有 SDK 用户最长 15min 内（旧 token 自然过期窗 口）会自动恢复，无需重启 App。

撤销动作进入审计 `proxy.merchant_app.revoke_tokens`。

后台位置：admin `/admin/merchant-apps`，merchant `/console/merchant/apps`， "撤销该 App 所有 token" action。

### 8.7 错误码

| 错误码 | HTTP | 触发 | 处置 |
| --- | --- | --- | --- |
| `sdk_manifest.signing_key.missing` | 503 | 控制面未配 Ed25519 私钥 | 联系平台 ops |
| `sdk_exchange.body.required` | 400 | merchant_id / app_id 缺 | 检查 wireraw-sdk.json |
| `sdk_exchange.device_id.required` | 400 | device_id 空 | App 启动期 mint 一份 |
| `sdk_exchange.bootstrap_nonce.mismatch` | 400 | nonce 缺 | 用 manifest 内的 nonce |
| `sdk_exchange.sdk_version.blocked` | 403 | 版本 < force_upgrade_below | 触发强升级 UX |
| `sdk_token.invalid` | 401 | wrsdk token 签名/过期 | 重 exchange |
| `sdk_token.scope.forbidden` | 403 | token scope 不含 dial/report | 重 exchange |
| `sdk_report.rate_limited` | 429 | per-device 60 events/5min | 应用层退避 |
| `sdk_manifest.app.inactive` | 403 | merchant_app status != active | 联系商户 |

更多细节见 `docs/architecture/SDK_CONNECTION_ARCHITECTURE.zh.md`。

## 9. entitlement 凭证(上游授权断言)验签接入

> 适用对象:把**顾客授权真相**握在自己手里的商户。你作为**上游签发端**,给每个顾客签一张 entitlement 凭证;顾客 SDK 在 exchange 时把它带给 WireRaw,WireRaw**advisory 验签**——只观测、记录、灰度,**本批永不据此拒连/改配额**。 上线:f1c-b(2026-06-21)。**可选能力**:不接 = 现有 exchange 行为完全不变。

### 9.1 凭证形态与算法

- 凭证 =**EdDSA(Ed25519)签名的 JWS compact(即标准 JWT)**,三段式 `header.payload.signature`。
- JWS header 必须:`alg=EdDSA`、`typ=JWT`、**`kid`(密钥 ID,对应你 JWKS 里的某个 key)**。
- **不接受**`RS256` / `ES256` / `none` 等其它 `alg`。
- 这与第 8 节的 manifest 签发**用的是同一类 Ed25519 密钥体系,但用途不同**:manifest 签的是 App bootstrap 配置;entitlement 签的是单个顾客的授权断言。两套密钥**建议分开**。

### 9.2 你(签发端)要做的三件事

1. **签发 JWT**—— 用你的 Ed25519 私钥,按 §9.4 的 claim 集给顾客签。
2. **发布 JWKS**—— 把对应**公钥**以 JWKS 暴露在一个 HTTPS 端点(URL 与 WireRaw 约定);JWK 形态:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "alg": "EdDSA",
      "kid": "<key id>",
      "x": "<base64url 裸公钥>"
    }
  ]
}
```

- 支持多 key 并存(密钥轮换期);WireRaw 按 JWT header 的 `kid` 选 key,**缓存 + 后台定时刷新**(默认 staleness 30min / refresh 5min)。
- 轮换:先把新 key 加进 JWKS(老 key 暂留),再切签发用的新 `kid`,等旧凭证过期后撤老 key。

1. **让顾客 SDK 在 exchange 带上凭证**—— 见 §9.3。

### 9.3 顾客 SDK 怎么传(exchange 请求)

在第 8 节的 `POST <panel_base>/api/sdk/exchange` 请求体里**附加一个可选字段**`entitlement_credential`,填入你**自家账户服务签发的 JWS**(凭证从哪取、何时刷新由你的上游 App 接线决定,**不在 WireRaw SDK 的内置范围**——SDK 只提供这个槽位):

```json
{
 "merchant_id": "mp_xxxxx",
 "app_id": "com.example.app",
 "device_id": "...",
 "sdk_version": "20260617.1",
 "bootstrap_nonce": "...",
 "manifest_version": 7,
 "entitlement_credential": "<EdDSA JWS compact 字符串>"
}
```

- **可选 / additive**:不带这个字段 = advisory 结论 `missing`,**对 exchange 结果零影响**(旧 SDK 不带也照常工作)。
- **本批不在 API 响应里回传验签结果**。WireRaw 对凭证的验签**只落服务端可观测性**:
- metric `entitlement.verify.total{result=<§9.5 结果码>}`;
- 结构化日志 `entitlement.advisory.verify`(`verified`→Info,其余→Warn;带 `result / kid / reason / iss / jti / sub_hash`,其中 `sub` 只落短摘要,**永不落原值**)。
- 这些信号供 WireRaw 侧 soak 评估 + 未来 enforce 决策;你需要核对结果时找平台 ops 拉指标/日志。
- ⚠️**别和响应里既有的 `entitlement_state` / `entitlement_error_code` 字段混淆**:exchange 响应里那两个字段反映的是**该顾客在 WireRaw 侧账户的 entitlement 态**(`active`/`expired`…,用于客户端决定是否弹系统 VPN consent),**与你这张上传凭证的验签结果无关**,也不受其影响。

### 9.4 字段形态(JWT payload claims)

| 类别 | claim | 类型 | 说明 |
| --- | --- | --- | --- |
|**必需(标准)**| `iss` | string | 必须 == 与 WireRaw 约定的 issuer |
| | `sub` | string | 顾客 / 上游 entitlement 的 subject |
| | `aud` | string / string[] | **必须包含**与 WireRaw 约定的 audience |
| | `iat` | number(unix 秒) | 签发时间,**不得在未来**|
| | `exp` | number(unix 秒) | 过期时间(校验带时钟偏差容差) |
| | `jti` | string | JWT 唯一 ID |
|**业务**| `merchant_id` | string | 你的商户标识 |
| | `customer_id` 或 `customer_ref` | string | 顾客标识,二选一 |
| | `plan_ref` 或 `sku_ref` | string | 套餐/SKU 引用,二选一 |
| | `entitlement_status` | string | `active` / `disabled` / `expired` |
|**advisory-only**| `device_limit` | number(可空) | 设备数上限(参考) |
| | `traffic_limit_bytes` | number(可空) | 流量配额上限——**WireRaw 绝不据此 enforce 或写回配额**|
| | `expires_at` | number(unix 秒,可空) | entitlement 业务到期——**WireRaw 绝不据此覆盖自己的到期真相源**|

> 缺失的**可选**claim 不影响验签结论(只是少一个 advisory 维度)。**建议从最小稳定集起步**(标准 6 项 + merchant_id + customer 引用 + status),别一上来塞一堆商品字段,后续要加是兼容的。

### 9.5 验签口径(WireRaw 怎么验 → 你签发要满足什么)

按序执行,任一步失败即得对应结果码:

1. 解析 JWS,取 header 的 `kid`(缺 `kid` → `kid_unknown`)。
2. 用 `kid` 从你的 JWKS 取 Ed25519 公钥:不在已缓存集内 → 触发一次刷新;刷新后仍无 → `kid_unknown`;JWKS 整体拉不到且无 last-good 缓存 → `jwks_unavailable`。
3. **Ed25519 验签**(签名不匹配 → `invalid_signature`)。
4. 解析 + 校验 claim(JSON 结构坏 → `claim_invalid`):

- `iss` != 约定 issuer → `claim_invalid`(error_code `iss_mismatch`)。
- `aud` 不含约定 audience → `claim_invalid`(error_code `aud_mismatch`)。**aud 是硬校验**。
- `exp` 已过期(计入时钟偏差容差) → `expired`。
- `iat` 在未来(> now + skew) → `claim_invalid`(error_code `iat_future`)。

1. 全过 → `verified`。

**验签结果码(WireRaw 侧 metric `result` label / 日志 `result` 字段,共 9 个;不出现在 API 响应里)**:

| 结果码 | 含义 |
| --- | --- |
| `verified` | 验签 + claim 全过 |
| `missing` | 请求没带 `entitlement_credential` |
| `expired` | `exp` 已过期 |
| `invalid_signature` | Ed25519 签名不匹配 |
| `kid_unknown` | header 无 `kid` 或 JWKS 里找不到该 `kid` |
| `jwks_unavailable` | 你的 JWKS 端点拉不到且无可用缓存 |
| `claim_invalid` | claim 结构坏 / `iss` 不符 / `aud` 不含 / `iat` 在未来 |
| `disabled` | (保留)凭证标记为停用 |
| `not_configured` | WireRaw 侧未配齐 issuer/audience/JWKS,验签惰性跳过 |

### 9.6 重要边界(advisory-only,务必理解)

- **本批为 advisory**:验签失败 / 缺失 / 过期 / kid 未知**一律不拒绝连接**,只产出 §9.3 的服务端 metric + 日志,**不进 API 响应**。
- `traffic_limit_bytes` / `expires_at`**只做 advisory 解析**,**绝不覆盖**WireRaw 当前的配额 / 到期真相源——配额与到期仍以 WireRaw 侧顾客记录为准。
- **enforce(真按凭证拒连/改配额)本批未实现**,需要先积累 soak 观测数据 + owner 单独授权才会开启;届时会另行通知接入口径变更。
- WireRaw 侧需与你对齐**三个值**才会真正验签:`issuer` / `audience` /**JWKS URL**(任一缺失 → 所有凭证恒为 `not_configured`,验签惰性跳过)。对接前请把这三项一次性约定好。
