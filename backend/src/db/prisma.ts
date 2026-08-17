import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client";

export { PrismaClient };

/**
 * The database handle, imported directly by whatever needs it.
 *
 * One client per process is what Prisma expects — it owns the connection pool,
 * so creating a second one doubles the connections. Prisma connects lazily on
 * the first query, so importing this does not open a socket.
 */
export const prisma = new PrismaClient({
  // Prisma 7 talks to the database through a driver adapter rather than a
  // bundled engine, so the pool is the mariadb client's (it speaks the MySQL
  // protocol) and its lifetime is owned by this client.
  adapter: new PrismaMariaDb(config.DATABASE_URL),
});
