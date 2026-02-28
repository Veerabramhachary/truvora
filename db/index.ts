import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as dotenv from 'dotenv';
import * as schema from '../db/schema'

dotenv.config()

// 1. Initialize Neon connection
const sql = neon(process.env.DATABASE_URL!);

// 2. Initialize Drizzle with your schema
export const db = drizzle(sql, { schema });