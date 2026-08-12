# WireRaw 商户 SD-WAN 对接文档

> 本文给出商户 SD-WAN 对接面（网络 / 节点 / ACL / 流控 / 域名 / 中继 / 隧道 / 升级）。仅在商户套餐或后台开关启用 SD-WAN 时生效。 公共鉴权与请求头见左侧「API 接口」标签页 §1 / §3。

## 1. 启用条件与边界

| 条件 | 说明 |
| --- | --- |
| 商户套餐 | 必须包含 SD-WAN 能力（`scopes` 含 `sdwan`） |
| 后台开关 | 商户后台 → 我的资料 → SD-WAN 启用 |
| 鉴权 | 同主 API：`X-Wireraw-Key-ID` + `X-Wireraw-Key-Secret`，或后台 session |

SD-WAN 子面覆盖：自己网络的节点 / 拓扑 / ACL / 流控 / 域名 / 中继。

## 2. SD-WAN 端点全览

| 能力 | 路径 | 方法 | 说明 |
| --- | --- | --- | --- |
| 网络列表 / 创建 | `/v1/sdwan/networks` | GET / POST | 商户级 VPN 网络；含 `cidr` / `dns` |
| 网络详情 | `/v1/sdwan/networks/{id}` | GET | 含节点 / hostname / ACL 摘要 |
| 节点列表 | `/v1/sdwan/nodes` | GET | 当前商户网络内节点 |
| 节点详情 | `/v1/sdwan/nodes/{id}` | GET | 包含 `vpn_ip`/ `role`（中心/枢纽/辐条/中继） |
| 拓扑 | `/v1/sdwan/network/topology` | GET | 节点连接关系图 |
| ACL 规则 | `/v1/sdwan/acl/rules` | GET / POST | 网络访问控制 |
| ACL 测试 | `/v1/sdwan/acl/evaluate` | POST | 给定 src/dst 计算规则命中 |
| 流控规则 | `/v1/sdwan/flow-rules` | GET / POST | 带宽 / QoS |
| 自定义域名 | `/v1/sdwan/networks/{id}/hostnames` | GET / POST | 网络内 DNS 记录 |
| 域名记录删除 | `/v1/sdwan/hostnames/{record_id}` | DELETE | 删单条 |
| 中继组 / 中继 | `/v1/sdwan/relay-groups`/`/v1/sdwan/relays` | GET / POST | 中继分组 |
| 隧道 | `/v1/sdwan/transport/tunnels` | GET / POST | 节点间传输隧道 |
| 升级任务 | `/v1/sdwan/upgrade-tasks` | GET / POST | 商户网络内节点 agent 升级 |

## 3. 网络管理

**列网络**：

```bash
curl -fsS "${HOST}/v1/sdwan/networks" "${HDRS[@]}" | jq .
```

**创建网络**：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/networks" "${HDRS[@]}" -d '{
 "name": "prod-asia",
 "cidr": "10.42.0.0/16",
 "dns": ["10.42.0.1"],
 "note": "Singapore + Hong Kong"
}' | jq .
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 网络名；商户内唯一 |
| `cidr` | string | 是 | VPN 内网 CIDR；不能与已有网络冲突 |
| `dns` | array<string> | 否 | 网络内 DNS server；默认网关 +1 |
| `note` | string | 否 | 备注 |

## 4. 节点与拓扑

**列节点**：

```bash
curl -fsS "${HOST}/v1/sdwan/nodes?network_id=net_xxx" "${HDRS[@]}" | jq .
```

**响应字段**：

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `id` | string | `sdn_xxx` | SD-WAN 节点 ID |
| `network_id` | string | `net_xxx` | 所属网络 |
| `role` | enum | `spoke` | `center` / `hub` / `spoke` / `relay` |
| `vpn_ip` | string | `10.42.0.21` | VPN 内 IP |
| `public_ip` | string | `203.0.113.21` | 出口 IPv4（仅 hub/relay 需要） |
| `status` | enum | `active` | `active` / `disabled` / `pending` |
| `assigned_relay_id` | string | `rly_xxx` | 主中继；`spoke` 节点的回源路径 |
| `backup_relay_id` | string | `rly_yyy` | 备份中继；主中继失败时自动切 |

**网络拓扑**：

```bash
curl -fsS "${HOST}/v1/sdwan/network/topology?network_id=net_xxx" "${HDRS[@]}" | jq .
```

响应是有向图：`nodes[]` + `edges[]`（含 `from` / `to` / `kind` 区分主备路径）。

## 5. ACL 与流控

**列 ACL 规则**：

```bash
curl -fsS "${HOST}/v1/sdwan/acl/rules?network_id=net_xxx" "${HDRS[@]}" | jq .
```

**创建 ACL 规则**：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/acl/rules" "${HDRS[@]}" -d '{
 "network_id": "net_xxx",
 "name": "deny-db-to-external",
 "src_cidrs": ["10.42.10.0/24"],
 "dst_cidrs": ["0.0.0.0/0"],
 "ports": ["3306","5432","6379"],
 "action": "deny",
 "priority": 100
}'
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `network_id` | string | 是 | 目标网络 |
| `name` | string | 是 | 规则名 |
| `src_cidrs` | array<string> | 是 | 源 CIDR 列表 |
| `dst_cidrs` | array<string> | 是 | 目的 CIDR 列表 |
| `ports` | array<string> | 否 | 端口或端口范围（如 `"80"` / `"8000-8999"`） |
| `protocol` | enum | 否 | `tcp` / `udp` / `icmp` / `any`（默认 `any`） |
| `action` | enum | 是 | `allow` / `deny` |
| `priority` | int | 否 | 数值小优先匹配；默认 100 |

**ACL 测试**：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/acl/evaluate" "${HDRS[@]}" -d '{
 "network_id": "net_xxx",
 "src": "10.42.10.5",
 "dst": "203.0.113.100",
 "port": 3306,
 "protocol": "tcp"
}'
```

返回命中的规则 ID 与最终 action。

**流控规则**：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/flow-rules" "${HDRS[@]}" -d '{
 "network_id": "net_xxx",
 "name": "limit-spoke-to-100mbps",
 "src_cidrs": ["10.42.20.0/24"],
 "dst_cidrs": ["10.42.0.0/16"],
 "rate_mbps": 100,
 "burst_mbps": 200
}'
```

## 6. 自定义域名

商户 VPN 内自定义 DNS 记录：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/networks/net_xxx/hostnames" "${HDRS[@]}" -d '{
 "hostname": "db.internal",
 "record_type": "A",
 "value": "10.42.10.5",
 "ttl": 300
}'
```

支持 `A` / `AAAA` / `CNAME` / `TXT`。删单条：

```bash
curl -fsS -X DELETE "${HOST}/v1/sdwan/hostnames/rec_xxx" "${HDRS[@]}"
```

## 7. 中继与隧道

**中继组**（多中继负载分担）：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/relay-groups" "${HDRS[@]}" -d '{
 "name": "asia-relay",
 "relay_ids": ["rly_aaa","rly_bbb"]
}'
```

`spoke` 节点 `assigned_relay_id` 可填中继 ID 或中继组 ID；中继组会按健康度自动分流。

**列中继**：

```bash
curl -fsS "${HOST}/v1/sdwan/relays" "${HDRS[@]}" | jq .
```

**传输隧道**（高级，节点间显式建隧道）：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/transport/tunnels" "${HDRS[@]}" -d '{
 "network_id": "net_xxx",
 "from_node_id": "sdn_aaa",
 "to_node_id": "sdn_bbb",
 "kind": "wireguard"
}'
```

## 8. 升级任务

商户网络内节点 agent 批量升级：

```bash
curl -fsS -X POST "${HOST}/v1/sdwan/upgrade-tasks" "${HDRS[@]}" -d '{
 "network_id": "net_xxx",
 "target_version": "20260517.3",
 "node_ids": ["sdn_aaa","sdn_bbb"],
 "strategy": "rolling",
 "max_concurrency": 2
}'
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `network_id` | string | 是 | 目标网络 |
| `target_version` | string | 是 | 目标版本（YYYYMMDD.N） |
| `node_ids` | array<string> | 否 | 指定节点；不传 = 全网升级 |
| `strategy` | enum | 否 | `rolling` / `parallel`；默认 `rolling` |
| `max_concurrency` | int | 否 | `rolling` 时同时升级的节点数；默认 1 |

查询进度：`GET /v1/sdwan/upgrade-tasks/{id}` 返回每节点的 dispatched / running / finished / failed 状态。

## 9. 注意事项

- **网络 CIDR 冲突**：不同网络的 CIDR 必须互斥；创建时会校验。
- **节点角色不可改**：`role` 一旦定下（center / hub / spoke / relay），不能直接改；需要先删节点再重新加入。
- **ACL 优先级**：数值小优先；命中即停。`deny` 规则建议放高优先级。
- **流控不是 QoS**：当前 flow-rules 实现的是限速，不做优先级队列；高级 QoS 需要联系平台。
- **升级回滚**：`rolling` 升级失败会自动停在已升级 + 失败的节点；要回滚需要再发一次升级任务指向旧版本。
- **审计**：所有 SD-WAN 写操作进入 `sdwan.*` 审计流；事故定责依赖 `actor.username` / `actor.ip`。
