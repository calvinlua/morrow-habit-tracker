import dotenv from "dotenv";

// npm runs workspace scripts from the package directory, so a bare
// `dotenv/config` would only ever find backend/.env. The repo keeps one .env at
// the root next to docker-compose.yml; a per-package one still wins if present.
dotenv.config({ path: [".env", "../.env"] });

export interface Config {
  PORT: number;
  DATABASE_URL: string;
  APP_TIMEZONE: string;
  NODE_ENV: "development" | "test" | "production";
}


const DEFAULT_PORT = 3001;
const DEFAULT_TIMEZONE = "Asia/Singapore";
const ENVIRONMENTS = ["development", "test", "production"] as const;

/**
 * Reads the environment once, at boot, and refuses to start on nonsense.
 *
 * Four variables do not need a schema library — plain checks say the same thing
 * and the error messages are written rather than generated. The point is only
 * that a bad value stops the process here, with the variable's name in the
 * message, instead of surfacing later as a connection error that explains
 * nothing.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const databaseUrl = env["DATABASE_URL"]?.trim();
  // No default: a missing connection string should stop the process, not
  // quietly point it at whatever happens to be listening on localhost.
  if (!databaseUrl) {
    problems.push("DATABASE_URL is required. See backend/.env.example.");
  }

  const port = env["PORT"] === undefined ? DEFAULT_PORT : Number(env["PORT"]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    problems.push(`PORT must be a port number, got "${env["PORT"]}".`);
  }

  const timeZone = env["APP_TIMEZONE"]?.trim() || DEFAULT_TIMEZONE;
  if (!isValidTimeZone(timeZone)) {
    problems.push(`APP_TIMEZONE is not an IANA timezone: "${timeZone}" (e.g. Asia/Singapore).`);
  }

  const nodeEnv = env["NODE_ENV"]?.trim() || "development";
  if (!isEnvironment(nodeEnv)) {
    problems.push(`NODE_ENV must be one of ${ENVIRONMENTS.join(", ")}, got "${nodeEnv}".`);
  }

  if (problems.length > 0) {
    // Every problem at once: fixing one variable per restart is a bad way to
    // spend a first afternoon on a project.
    throw new Error(`Invalid environment configuration:\n  ${problems.join("\n  ")}`);
  }

  return {
    PORT: port,
    DATABASE_URL: databaseUrl as string,
    APP_TIMEZONE: timeZone,
    NODE_ENV: nodeEnv as Config["NODE_ENV"],
  };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function isEnvironment(value: string): value is Config["NODE_ENV"] {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * The environment, read once at startup and imported wherever it is needed.
 *
 * Declared last because the constants and helpers above are `const`: calling
 * loadConfig() any earlier in the file reaches them before initialisation.
 * A bad value throws here, during module loading, so the process dies at boot
 * rather than on the first request that happens to need the missing variable.
 */
export const config: Config = loadConfig();
