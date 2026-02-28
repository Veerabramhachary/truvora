import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    PORT: z.string().default("3000").transform(Number),
    NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Invalid environment variables:", _env.error.format());
    process.exit(1);
}

export const config = _env.data;
