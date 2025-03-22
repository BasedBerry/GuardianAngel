import { schema } from "./schema";
import { Database } from "./sequin";
import { dbConnection } from "./sqlite3";

export const db = new Database(schema, dbConnection);
