import { sql } from "kysely";
import { DBSchema, TableName } from "../types";
import {
	getFTS5VirtualTableName,
	getVectorVirtualTableName,
	VTABLE_COLUMN_ORIGINPK,
} from "./naming";
import { getFullTextColumns, getVectorColumns, q } from "./util";

export function cmdGarbageCollectAllTables<S extends DBSchema>(schema: S) {
	const commands = [];

	for (const table of Object.keys(schema)) {
		commands.push(...cmdGarbageCollectSingleTable(schema, table));
	}

	return commands;
}

export function cmdGarbageCollectSingleTable<S extends DBSchema>(schema: S, table: TableName<S>) {
	const pkName = `${table}.${schema[table].primaryKey}`;

	const fts5TableName = getFTS5VirtualTableName(table);
	const vectorTableName = getVectorVirtualTableName(table);

	const commands = [];

	if (getFullTextColumns(schema[table]).length > 0) {
		commands.push(
			sql`DELETE FROM ${sql.raw(fts5TableName)} WHERE NOT EXISTS (SELECT 1 FROM ${sql.raw(
				table
			)} WHERE ${sql.raw(VTABLE_COLUMN_ORIGINPK)} = ${sql.raw(pkName)});`.compile(q)
		);
	}

	if (getVectorColumns(schema[table]).length > 0) {
		commands.push(
			sql`DELETE FROM ${sql.raw(vectorTableName)} WHERE NOT EXISTS (SELECT 1 FROM ${sql.raw(
				table
			)} WHERE ${sql.raw(VTABLE_COLUMN_ORIGINPK)} = ${sql.raw(pkName)});`.compile(q)
		);
	}

	return commands;
}
