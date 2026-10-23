import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    allowedDevOrigins: ["192.168.43.163", "*.app.github.dev"],
    
    // Explicitly allow Server Actions from these origins
    experimental: {
        serverActions: {
            // Codespaces is forwarding the public host while this request's
            // Origin is still localhost:3000. Trust that dev origin explicitly.
            allowedOrigins: ["192.168.43.163", "*.app.github.dev", "localhost:3000"],
        },
    },

    // Pin the workspace root instead of letting Next infer it. Without this,
    // a stray lockfile in a parent directory makes Turbopack resolve modules
    // against the wrong root and prints a warning on every build.
    turbopack: {
        root: projectRoot,
    },

    /*
     * Baseline security headers.
     * ... (rest of your headers remain unchanged)
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
