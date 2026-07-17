# HabibiVPN

自有 VPN 品牌系统：用户端（H5 / App）+ 运营后台 + WireRaw 上游对接。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| API | Node.js · Fastify · Prisma · MySQL |
| 管理后台 | React · Ant Design Pro Components · Vite |
| 用户 H5 | Next.js |
| 缓存/队列 | Redis |
| 上游 | WireRaw Merchant API |

## 仓库结构

```text
apps/api      # 后端（User API + Admin API + WireRaw 适配）
apps/admin    # 运营后台
apps/web      # 用户 H5
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

```bash
# 终端 1
pnpm dev:api

# 终端 2
pnpm dev:admin

# 终端 3
pnpm dev:web
```

- API: http://127.0.0.1:3001/health  
- Admin: http://127.0.0.1:8000 （默认 `admin` / `admin123`）  
- H5: http://127.0.0.1:3000  

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

- `POST /api/v1/auth/register` / `login`（注册可带 `invite_code` / H5 `?ref=`）
- `GET /api/v1/me`
- `GET /api/v1/plans`（含 `is_free_claimable` / `already_claimed`）
- `GET /api/v1/nodes`（节点池汇总：地区 / 状态 / 数量，不含 IP）
- `POST /api/v1/subscriptions/claim`（免费领取 → 新建上游顾客槽）
- `GET /api/v1/subscriptions`（多套餐列表）
- `GET /api/v1/subscription`（兼容：主订阅 + 列表）
- `POST /api/v1/subscriptions/:id/change-plan`（续费/改套餐，upsert 同上游 id，订阅链接不变）
- `GET /api/v1/promo/overview|tools|team|commissions|team-orders|withdrawals`
- `POST /api/v1/promo/withdrawals`（申请提现）

模型：本地用户 1:N 上游顾客；每个上游顾客 = 一个套餐槽（含独立 `subscription_url`）。  
种子免费套餐：`pnpm --filter @habibi/api exec tsx scripts/seed-free-plan.ts`（code=`free_trial`）。

H5：`pnpm dev:web` → http://127.0.0.1:3000（注册 → 领取 → 复制订阅链接；「我的」→ 推广中心）  
手机访问可用同一局域网 IP（如 `http://192.168.x.x:3000`）。若 3000 被占用，Next 会换端口，以终端打印的 Local 地址为准。

后台「Habibi 用户」可「新增套餐」或对已有槽「续费/改套餐」。  
后台「分销」：配置比例 / 邀请关系 / 佣金流水 / 提现审核 / 补记付费订单（支付上线前联调分佣）。

## 开发阶段（摘要）

0–3. 上游联调 + Admin（已可用）  
4. User API + H5：注册 / 登录 / 免费领取 / 多订阅（已完成）  
4.5 N 级分销：邀请绑定、佣金结算、提现审核、推广中心（已完成）  
5. 支付闭环（暂缓；分佣挂 `Order.paid`，可复用 `settleCommissionsForOrder`） 

