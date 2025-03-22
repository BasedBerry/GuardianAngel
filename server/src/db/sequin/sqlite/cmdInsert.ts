import { DBSchema, RowReverseSerialized, TableName } from "../types";
import {
	filterFullTextColumns,
	filterNonVirtualColumns,
	filterAndSerializeVectorColumns,
	getFullTextColumns,
	getVectorColumns,
	jsonSerializeColumnsForInsert,
	q,
	normalizeStringValues,
} from "./util";
import {
	getFTS5VirtualTableName,
	getVectorVirtualTableName,
	VTABLE_COLUMN_ORIGINPK,
} from "./naming";

/**
 * Generates SQL commands to insert a row into a table and its associated FTS5 table (if applicable).
 */
export function cmdInsert<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	row: RowReverseSerialized<T, S>,
	schema: S
) {
	const commands = [];
	const table = schema[tableName];

	// Insert into main table
	const mainInsert = q
		.insertInto(tableName)
		.values(jsonSerializeColumnsForInsert(schema, tableName, filterNonVirtualColumns(row, table)))
		.compile();
	commands.push({ sql: mainInsert.sql, parameters: mainInsert.parameters });

	// Insert into FTS5 table if there are full-text columns
	const fullTextColumns = getFullTextColumns(table);
	if (fullTextColumns.length > 0) {
		const fts5Values = {
			[VTABLE_COLUMN_ORIGINPK]: row[table.primaryKey],
			...normalizeStringValues(filterFullTextColumns(row, table)),
		};

		const fts5Insert = q
			.insertInto(getFTS5VirtualTableName(tableName))
			.values(fts5Values)
			.compile();
		commands.push({ sql: fts5Insert.sql, parameters: fts5Insert.parameters });
	}

	// Insert into vector table if there are vector columns
	const vectorColumns = getVectorColumns(table);
	if (vectorColumns.length > 0) {
		const vectorValues = {
			[VTABLE_COLUMN_ORIGINPK]: row[table.primaryKey],
			...filterAndSerializeVectorColumns(row, table),
		};

		const vectorInsert = q
			.insertInto(getVectorVirtualTableName(tableName))
			.values(vectorValues)
			.compile();
		commands.push({ sql: vectorInsert.sql, parameters: vectorInsert.parameters });
	}

	return commands;
}

export function cmdInsertMany<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	rows: RowReverseSerialized<T, S>[],
	schema: S
) {
	const commands = [];
	const table = schema[tableName];

	// Bulk insert into main table
	const mainInsertValues = rows.map(row =>
		jsonSerializeColumnsForInsert(schema, tableName, filterNonVirtualColumns(row, table))
	);
	const mainInsert = q.insertInto(tableName).values(mainInsertValues).compile();
	commands.push({ sql: mainInsert.sql, parameters: mainInsert.parameters });

	// Bulk insert into FTS5 table if there are full-text columns
	const fullTextColumns = getFullTextColumns(table);
	if (fullTextColumns.length > 0) {
		const fts5Values = rows.map(row => ({
			[VTABLE_COLUMN_ORIGINPK]: row[table.primaryKey],
			...filterFullTextColumns(row, table),
		}));

		const fts5Insert = q
			.insertInto(getFTS5VirtualTableName(tableName))
			.values(fts5Values)
			.compile();
		commands.push({ sql: fts5Insert.sql, parameters: fts5Insert.parameters });
	}

	// Bulk insert into vector table if there are vector columns
	const vectorColumns = getVectorColumns(table);
	if (vectorColumns.length > 0) {
		const vectorValues = rows.map(row => ({
			[VTABLE_COLUMN_ORIGINPK]: row[table.primaryKey],
			...filterAndSerializeVectorColumns(row, table),
		}));

		const vectorInsert = q
			.insertInto(getVectorVirtualTableName(tableName))
			.values(vectorValues)
			.compile();
		commands.push({ sql: vectorInsert.sql, parameters: vectorInsert.parameters });
	}

	return commands;
}
