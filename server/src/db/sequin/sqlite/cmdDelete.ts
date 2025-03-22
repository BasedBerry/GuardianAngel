import { DBSchema, JSTypeOfColumn, PrimaryKeyName, TableName } from "../types";
import { CompiledQuery } from "kysely";
import { getFullTextColumns, getVectorColumns, q } from "./util";
import {
	VTABLE_COLUMN_ORIGINPK,
	getFTS5VirtualTableName,
	getVectorVirtualTableName,
} from "./naming";

/**
 * Generates SQL commands to bulk delete rows from a table and its associated FTS5 table (if applicable).
 */
export function cmdDeleteMany<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	pks: Array<JSTypeOfColumn<PrimaryKeyName<T, S>, S>>,
	schema: S
) {
	const commands: CompiledQuery[] = [];
	const table = schema[tableName];

	// Skip if no rows to delete
	if (pks.length === 0) {
		return commands;
	}

	// Delete from main table
	const mainDelete = q.deleteFrom(tableName).where(table.primaryKey, "in", pks).compile();

	commands.push(mainDelete);

	// Delete from FTS5 table if there are full-text columns
	const fullTextColumns = getFullTextColumns(table);
	if (fullTextColumns.length > 0) {
		const fts5TableName = getFTS5VirtualTableName(tableName);
		const fts5Delete = q
			.deleteFrom(fts5TableName)
			.where(VTABLE_COLUMN_ORIGINPK, "in", pks)
			.compile();
		commands.push(fts5Delete);
	}

	// Delete from vector table if there are vector columns
	const vectorColumns = getVectorColumns(table);
	if (vectorColumns.length > 0) {
		const vectorTableName = getVectorVirtualTableName(tableName);
		const vectorDelete = q
			.deleteFrom(vectorTableName)
			.where(VTABLE_COLUMN_ORIGINPK, "in", pks)
			.compile();
		commands.push(vectorDelete);
	}

	return commands;
}
