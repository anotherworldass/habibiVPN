# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/tg/package.json apps/tg/
COPY packages/shared/package.json packages/shared/
# prisma / typescript / vite 都在 devDependencies，构建期必须装全量
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# deps 阶段为了装 devDependencies 设了 development；next build 必须是 production，
# 否则 15.5 预渲染 /404 会报 <Html> should not be imported outside of pages/_document
ENV NODE_ENV=production
# Next.js rewrites 在 build 时写入 routes-manifest。API 走 host 网络，从 web 容器走宿主机
ENV HABIBI_API_ORIGIN=http://host.docker.internal:3001
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/build
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @habibi/shared build \
  && pnpm --filter @habibi/api prisma:generate \
  && pnpm --filter @habibi/api build \
  && pnpm --filter @habibi/web build \
  && pnpm --filter @habibi/tg build \
  && pnpm --filter @habibi/admin build

FROM base AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
COPY deploy/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]

FROM base AS web
COPY --from=build /app /app
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV HABIBI_API_ORIGIN=http://host.docker.internal:3001
EXPOSE 3000
CMD ["node", "habibi-web.js"]

FROM base AS tg
COPY --from=build /app /app
WORKDIR /app/apps/tg
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002
ENV HABIBI_API_ORIGIN=http://host.docker.internal:3001
EXPOSE 3002
CMD ["node", "habibi-tg.js"]

FROM nginx:1.27-alpine AS admin
COPY deploy/nginx-admin.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
