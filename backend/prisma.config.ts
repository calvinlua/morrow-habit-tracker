import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/scripts/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // A scratch database for `migrate dev` to replay migrations into when it
    // checks for drift. Keeping it explicit means the app's database user does
    // not need permission to create databases.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
