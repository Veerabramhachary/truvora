import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    allowedDevOrigins: ["192.168.43.163"],
    // Pin the workspace root instead of letting Next infer it. Without this,
    // a stray lockfile in a parent directory makes Turbopack resolve modules
    // against the wrong root and prints a warning on every build.
    turbopack: {
        root: projectRoot,
    },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);
