import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

const { loadedEnvFiles } = loadEnvConfig(process.cwd());

console.log("Current directory:", process.cwd());
console.log(
    "Loaded env files:",
    loadedEnvFiles.map((f) => f.path),
);
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

export default defineConfig({
    out: "./drizzle",
    schema: "./db/schema/*.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
