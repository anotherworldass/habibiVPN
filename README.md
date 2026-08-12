# HabibiVPN

自有 VPN 品牌系统：用户端（H5 / Telegram Mini App / App）+ 运营后台 + WireRaw 上游对接。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| API | Node.js · Fastify · Prisma · MySQL |
| 管理后台 | React · Ant Design Pro Components · Vite |
| 用户 H5 | Next.js |
| Telegram Mini App | Next.js（`apps/tg`） |
| 用户 App | Flutter（`clients/` 下各马甲包） |
| 缓存/队列 | Redis |
| 上游 | WireRaw Merchant API |

## 仓库结构

```text
apps/api      # 后端（User API + Admin API + WireRaw 适配）
apps/admin    # 运营后台
apps/web      # 用户 H5
apps/tg       # Telegram Mini App
clients/      # Flutter 马甲包（每品牌一个子目录）
packages/shared
```
## 快速开始

### 1. 环境变量

```bash
cp .env.example .env
# 编辑 .env：填入 WireRaw Key（见 info.txt，勿提交）
```

### 2. 基础设施

需本机 Docker Desktop 已启动：

```bash
pnpm db:up
```

MySQL 映射到主机 **3308**（避免与本机 3306 冲突）。`DATABASE_URL` 见 `.env.example`。

### 3. 安装依赖 & 数据库

```bash
pnpm install
pnpm --filter @habibi/shared build
pnpm db:generate
pnpm db:migrate
```

### 4. 启动

一键（推荐，需 Docker Desktop 已开）：

```bash
pnpm dev
# 仅 API + Admin：pnpm dev:api-admin
# 不含 TG：bash scripts/dev-local.sh --no-tg
# 打开浏览器：bash scripts/dev-local.sh --open
```

或分终端：

```bash
# 终端 1
pnpm dev:api

# 终端 2
pnpm dev:admin

# 终端 3
pnpm dev:web

# 终端 4
pnpm dev:tg
```

- API: http://127.0.0.1:3001/health  
- Admin: http://127.0.0.1:8000 （默认 `admin` / `admin123`）  
- H5: http://127.0.0.1:3000  
- TG Mini App: http://127.0.0.1:3002  

### 5. 上游联调

```bash
pnpm wireraw:smoke
```

管理端登录后调用 `/admin/v1/*`（Bearer JWT）。WireRaw 代理含：顾客 CRUD / 续期撤销换链 / 批量、节点、拨号、流量、商户配额等。

## API 约定

- 用户 / App / H5：`/api/v1/*`
- 运营后台：`/admin/v1/*`
- WireRaw Key **仅**存在于 API 进程环境变量

## 用户端 API（App / H5）

完整对接文档（鉴权、冷启动、支付/IAP、推广、页面对照）：

→ **[`docs/user-api-v1.md`](docs/user-api-v1.md)**

模型：本地用户 1:N 上游顾客；每个上游顾客 = 一个套餐槽（含独立 `subscription_url`）。  
种子免费套餐：`pnpm --filter @habibi/api exec tsx scripts/seed-free-plan.ts`（code=`free_trial`）。

H5：`pnpm dev:web` → http://127.0.0.1:3000（注册 → 领取 → 复制订阅链接；「我的」→ 推广中心）
手机访问可用同一局域网 IP（如 `http://192.168.x.x:3000`）。若 3000 被占用，Next 会换端口，以终端打印的 Local 地址为准。

Telegram Mini App：`pnpm dev:tg` → http://127.0.0.1:3002（独立壳层，业务复用同一 API；详见 `apps/tg/README.md`）

后台「Habibi 用户」可「新增套餐」或对已有槽「续费/改套餐」。  
后台「分销」：配置比例 / 邀请关系 / 佣金流水 / 提现审核 / 补记付费订单（支付上线前联调分佣）。

## App（Flutter）

客户端工程在 [`clients/`](clients/) 下，每个马甲包一个子目录。导入后按该工程自带说明构建/运行即可。

## 开发阶段（摘要）

0–3. 上游联调 + Admin（已可用）  
4. User API + H5：注册 / 登录 / 免费领取 / 多订阅（已完成）  
4.5 N 级分销：邀请绑定、佣金结算、提现审核、推广中心（已完成）  
5. App：`clients/` 马甲包接入 Habibi 登录/订阅（进行中）  
6. 支付闭环：可配置服务商/通道、微信与支付宝下单、查单、验签回调、自动开通及分佣（已完成）

