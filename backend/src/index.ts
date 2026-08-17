import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db/prisma.js";

const server = createApp().listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT} (${config.APP_TIMEZONE})`);
});

// Let in-flight requests finish and close the connection pool before exiting,
// so a restart during development does not leave sockets open.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
