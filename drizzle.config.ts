import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./drizzle",
    // Only TypeScript sources: the directory also used to contain compiled
    // `.js` copies of the schema, which were picked up as a second schema
    // source by the glob.
    schema: "./db/schema/*.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
