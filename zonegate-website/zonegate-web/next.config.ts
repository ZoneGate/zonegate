import type { NextConfig } from "next";

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const rawBasePath =
  process.env.BASE_PATH ??
  (isDemo && process.env.NODE_ENV === "production" ? "/zonegate-website" : "");
const basePath = rawBasePath && rawBasePath !== "/" ? rawBasePath.replace(/\/$/, "") : undefined;

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image does not need
  // node_modules — see Dockerfile. In demo mode, exports static HTML for GitHub Pages.
  output: isDemo ? "export" : "standalone",
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true,
  },
  ...(isDemo
    ? {}
    : {
        async rewrites() {
          const backend = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
          return [{ source: "/api/backend/:path*", destination: `${backend}/:path*` }];
        },
      }),

  experimental: isDemo
    ? undefined
    : {
        // The rewrite above proxies to the API with a 30 s default timeout. A
        // decision runs the local agent model, and the first one after the model
        // has been idle loads it into memory first, which can take longer than
        // that; the proxy would then drop a request the backend still completes.
        proxyTimeout: 120_000,
      },

  // Pin the workspace root: a stray package-lock.json above this folder
  // otherwise makes Turbopack infer the wrong project root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
