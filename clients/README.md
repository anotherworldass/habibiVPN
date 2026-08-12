# clients

多品牌 / 马甲包 Flutter 客户端目录。

与仓库其他目录的分工：

- `apps/`：后端与 Web（api / admin / web）
- `clients/`：各品牌独立 Flutter 客户端工程

用户端 API 对接（冷启动、登录、套餐、支付/IAP、推广等）：

→ **[`docs/user-api-v1.md`](../docs/user-api-v1.md)**

TiTiVPN 已接入 `/api/v1`（默认 Base URL：`http://192.168.0.144:3001`，可用 `--dart-define=API_BASE_URL=...` 覆盖）。

导入约定：每个马甲包一个子目录，例如：

```text
clients/
  <brand-name>/   # 完整 Flutter 工程根目录（含 pubspec.yaml）
```

不要把代码直接丢在 `clients/` 根下。
