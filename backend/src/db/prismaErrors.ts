/** MySQL's duplicate-key error, as Prisma reports it. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Kept out of `prisma.ts` so that tests can replace the client — a module whose
 * import opens a connection pool — without also replacing this pure check.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
