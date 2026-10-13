import { requireIsolatedPostgres } from "../../scripts/postgres-runtime-isolation.mjs";

// Only the Worker binding is supplied by this Node runtime adapter. The provider,
// schema barrel, postgres.js driver, request scope and repositories stay real.
export const fakeR2Objects = new Map<
  string,
  { body: string; uploaded: Date }
>();
export const env = {
  DATABASE_PROVIDER: "postgres",
  HYPERDRIVE: { connectionString: requireIsolatedPostgres(process.env) },
  // Explicit storage fixture for verifying cleanup SQL against actual PG. The
  // authenticated application suite separately exercises real local R2.
  R2: {
    async head(key: string) {
      const value = fakeR2Objects.get(key);
      return value
        ? { key, uploaded: value.uploaded, size: value.body.length }
        : null;
    },
    async list({
      prefix,
      limit,
      cursor,
    }: {
      prefix: string;
      limit: number;
      cursor?: string;
    }) {
      const all = [...fakeR2Objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .toSorted();
      const offset = Number(cursor ?? 0);
      const keys = all.slice(offset, offset + limit);
      return {
        objects: keys.map((key) => ({
          key,
          size: fakeR2Objects.get(key)!.body.length,
          uploaded: fakeR2Objects.get(key)!.uploaded,
        })),
        truncated: offset + keys.length < all.length,
        cursor: String(offset + keys.length),
      };
    },
    async delete(key: string) {
      fakeR2Objects.delete(key);
    },
  },
};
