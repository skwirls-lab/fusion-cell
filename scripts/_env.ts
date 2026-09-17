/** Shared loader: every script reads .env.local, the same file Next.js uses. */
import { config } from 'dotenv';
config({ path: '.env.local' });
