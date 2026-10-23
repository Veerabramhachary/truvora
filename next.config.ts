import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    allowedDevOrigins: ["192.168.43.163"],
    // Pin the workspace root instead of letting Next infer it. Without this,
    // a stray lockfile in a parent directory makes Turbopack resolve modules
    // against the wrong root and prints a warning on every build.
    turbopack: {
        root: projectRoot,
    },

    /*
      Baseline security headers.

      Deliberately no CSP yet: a strict one has to allow-list Clerk's
      script/frame/connect origins, the Google Fonts stylesheets next/font
      self-hosts from, and later Razorpay's script host. Guessing that list
      breaks sign-in silently, so it needs a decision (and a Report-Only
      rollout) rather than a speculative default. These are the headers that
      are safe regardless.
    */
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload",
                    },
                    {
                        key: "X-Permitted-Cross-Domain-Policies",
                        value: "none",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
