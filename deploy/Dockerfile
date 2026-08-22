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
# Next.js rewrites 在 build 时写入 routes-manifest。同 compose 项目内走服务名 api
ENV HABIBI_API_ORIGIN=http://api:3001
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/build
ENV NODE_OPTIONS=--max-old-space-size=2048
# NEXT_PUBLIC_* 会被内联进客户端 bundle，只有构建期给才生效，运行时 env_file 无效。
# 由 compose 的 build.args 从 .env 透传；api/web/tg/admin 必须传同一组值，
# 否则本阶段缓存 key 分裂，整包会重复构建。
ARG NEXT_PUBLIC_WEBSITE_URL
ARG NEXT_PUBLIC_DOWNLOAD_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_SUPPORT_TELEGRAM
ARG NEXT_PUBLIC_TG_BOT_USERNAME
ARG NEXT_PUBLIC_TWITTER_URL
ARG NEXT_PUBLIC_APP_STORE_URL
ARG NEXT_PUBLIC_PLAY_STORE_URL
ARG NEXT_PUBLIC_ANDROID_APK_URL
ARG NEXT_PUBLIC_WINDOWS_URL
ARG NEXT_PUBLIC_MACOS_URL
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
ENV HABIBI_API_ORIGIN=http://api:3001
EXPOSE 3000
CMD ["node", "habibi-web.js"]

FROM base AS tg
COPY --from=build /app /app
WORKDIR /app/apps/tg
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002
ENV HABIBI_API_ORIGIN=http://api:3001
EXPOSE 3002
CMD ["node", "habibi-tg.js"]

FROM nginx:1.27-alpine AS admin
COPY deploy/nginx-admin.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
