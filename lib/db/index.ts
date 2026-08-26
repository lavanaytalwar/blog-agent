import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Explicit generics: arrayMode false, fullResults false — every query returns
// a plain array of row objects. Without pinning these, the return type is a
// three-way union and every call site needs a cast.
type Db = NeonQueryFunction<false, false>;

let client: Db | null = null;

export function sql(): Db {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Create a Neon project, then put the pooled ' +
          'connection string in .env — see .env.example.',
      );
    }
    client = neon(url);
  }
  return client;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
