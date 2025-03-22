import { sql } from "kysely";
import { q } from "./util";

export function cmdStat(tableName: string) {
	return sql`SELECT COUNT(*) as count FROM ${sql.raw(tableName)}`.compile(q);
}
