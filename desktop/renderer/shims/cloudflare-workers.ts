// Stands in for `cloudflare:workers` in the desktop build: the D1 binding is
// the Clinic PC's local database.
import { createLocalD1 } from "../local-d1";

export const env = { DB: createLocalD1() as unknown as D1Database };
