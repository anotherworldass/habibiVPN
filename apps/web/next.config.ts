import type { NextConfig } from "next";
import { formatAppVersion } from "../../packages/shared/build-stamp.mjs";

const apiOrigin =
  process.env.HABIBI_API_ORIGIN || "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: formatAppVersion(
      new Date(),
      process.env.NODE_ENV !== "production",
    ),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
