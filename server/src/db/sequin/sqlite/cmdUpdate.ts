import { DBSchema, JSTypeOfColumn, PrimaryKeyName, TableName, UpdateRowPayload } from "../types";
import {
	filterFullTextColumns,
	filterNonVirtualColumns,
	filterAndSerializeVectorColumns,
	getFullTextColumns,
	getVectorColumns,
	q,
	normalizeStringValues,
	jsonSerializeColumnsForInsert,
} from "./util";
import {
	VTABLE_COLUMN_ORIGINPK,
	getFTS5VirtualTableName,
	getVectorVirtualTableName,
} from "./naming";
import { CompiledQuery } from "kysely";

/**
 * Generates SQL commands to update a row in a table and its associated FTS5 table (if applicable).
 */
export function cmdUpdate<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	pk: JSTypeOfColumn<PrimaryKeyName<T, S>, S>,
	update: UpdateRowPayload<T, S>,
	schema: S
) {
	const commands = [];
	const table = schema[tableName];

	// Update main table
	const mainUpdate = q
		.updateTable(tableName)
		.set(jsonSerializeColumnsForInsert(schema, tableName, filterNonVirtualColumns(update, table)))
		.where(table.primaryKey, "=", pk)
		.compile();
	commands.push({ sql: mainUpdate.sql, parameters: mainUpdate.parameters });

	// Update FTS5 table if there are full-text columns
	const fullTextColumns = getFullTextColumns(table);
	if (fullTextColumns.length > 0) {
		const fts5Values = filterFullTextColumns(update, table);

		// Only update FTS5 if there are full-text columns being updated
		if (Object.keys(fts5Values).length > 0) {
			const fts5Update = q
				.updateTable(getFTS5VirtualTableName(tableName))
				.set(normalizeStringValues(fts5Values))
				.where(VTABLE_COLUMN_ORIGINPK, "=", pk)
				.compile();
			commands.push({ sql: fts5Update.sql, parameters: fts5Update.parameters });
		}
	}

	// Update vector table if there are vector columns
	const vectorColumns = getVectorColumns(table);
	if (vectorColumns.length > 0) {
		const vectorValues = filterAndSerializeVectorColumns(update, table);

		const vectorUpdate = q
			.updateTable(getVectorVirtualTableName(tableName))
			.set(vectorValues)
			.where(VTABLE_COLUMN_ORIGINPK, "=", pk)
			.compile();
		commands.push({ sql: vectorUpdate.sql, parameters: vectorUpdate.parameters });
	}

	return commands;
}

export function cmdUpdateMany<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	rows: UpdateRowPayload<T, S>[],
	schema: S
) {
	const commands: CompiledQuery[] = [];

	const table = schema[tableName];

	// Skip if no rows to update
	if (rows.length === 0) {
		return commands;
	}

	// Update main table
	for (const row of rows) {
		const mainUpdate = q
			.updateTable(tableName)
			.set(jsonSerializeColumnsForInsert(schema, tableName, filterNonVirtualColumns(row, table)))
			.where(table.primaryKey, "=", row[table.primaryKey as keyof typeof row])
			.compile();
		commands.push(mainUpdate);
	}

	// Update FTS5 table if there are full-text columns
	const fullTextColumns = getFullTextColumns(table);
	if (fullTextColumns.length > 0) {
		for (const row of rows) {
			const fts5Values = filterFullTextColumns(row, table);

			// Only update FTS5 if there are full-text columns being updated
			if (Object.keys(fts5Values).length > 0) {
				const fts5Update = q
					.updateTable(getFTS5VirtualTableName(tableName))
					.set(fts5Values)
					.where(VTABLE_COLUMN_ORIGINPK, "=", row[table.primaryKey as keyof typeof row])
					.compile();
				commands.push(fts5Update);
			}
		}
	}

	// Update vector table if there are vector columns
	const vectorColumns = getVectorColumns(table);
	if (vectorColumns.length > 0) {
		for (const row of rows) {
			const vectorValues = filterAndSerializeVectorColumns(row, table);

			const vectorUpdate = q
				.updateTable(getVectorVirtualTableName(tableName))
				.set(vectorValues)
				.where(VTABLE_COLUMN_ORIGINPK, "=", row[table.primaryKey as keyof typeof row])
				.compile();
			commands.push(vectorUpdate);
		}
	}

	return commands;
}
