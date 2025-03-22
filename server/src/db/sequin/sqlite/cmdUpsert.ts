import { DBSchema, PrimaryKeyName, RowReverseSerialized, TableName } from "../types";
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
import { CompiledQuery } from "kysely";

/**
 * Generates SQL commands to bulk upsert rows in a table and its associated FTS5 table (if applicable).
 */
export function cmdUpsertMany<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	rows: RowReverseSerialized<T, S>[],
	schema: S
) {
	const commands: CompiledQuery[] = [];
	const table = schema[tableName];

	// Skip if no rows to upsert
	if (rows.length === 0) {
		return commands;
	}

	// Prepare main table upsert
	const mainValues = rows.map(row =>
		jsonSerializeColumnsForInsert(schema, tableName, filterNonVirtualColumns(row, table))
	);

	const columns = Object.entries(schema[tableName].columns).filter(
		([_, column]) => column.type !== "fullTextString" && column.type !== "vector"
	);

	// for more information on this query pattern see
	// - https://www.sqlite.org/lang_upsert.html
	// we use the equivalent `ON CONFLICT / DO UPDATE SET` pattern since
	// kysely does not support SQLite's `UPSERT` syntax directly
	const relevantUpdateOnConflictColumns = columns.filter(
		([colName, col]) => !col.noReplaceOnUpsert && colName !== schema[tableName].primaryKey
	);
	const mainUpsert = q
		.insertInto(tableName)
		.values(mainValues)
		.onConflict(oc => {
			if (relevantUpdateOnConflictColumns.length > 0) {
				return oc
					.column(table.primaryKey)
					.doUpdateSet(eb =>
						Object.fromEntries(
							relevantUpdateOnConflictColumns.map(([colName]) => [
								colName,
								eb.ref("excluded." + colName),
							])
						)
					);
			}

			return oc.doNothing();
		})
		.compile();

	commands.push(mainUpsert);

	// Handle FTS5 table if there are full-text columns
	// NOTE: virtual tables do not support `ON CONFLICT / DO UPDATE SET`
	// instead we delete the existing rows and insert the new ones
	const fullTextColumns = getFullTextColumns(table);
	const primaryKey: PrimaryKeyName<T, S> = schema[tableName].primaryKey;

	if (fullTextColumns.length > 0) {
		const fts5TableName = getFTS5VirtualTableName(tableName);
		const pks = rows.map(row => row[primaryKey]);

		// Delete existing FTS5 entries for these PKs
		const fts5Delete = q
			.deleteFrom(fts5TableName)
			.where(VTABLE_COLUMN_ORIGINPK, "in", pks)
			.compile();
		commands.push(fts5Delete);

		// Insert new FTS5 entries
		const fts5Values = rows.map(row => ({
			[VTABLE_COLUMN_ORIGINPK]: row[primaryKey],
			...normalizeStringValues(filterFullTextColumns(row, table)),
		}));

		const fts5Insert = q.insertInto(fts5TableName).values(fts5Values).compile();
		commands.push(fts5Insert);
	}

	// Handle vector table if there are vector columns
	// similarly, we delete the existing rows and insert the new ones
	const vectorColumns = getVectorColumns(table);

	if (vectorColumns.length > 0) {
		const vectorTableName = getVectorVirtualTableName(tableName);
		const pks = rows.map(row => row[primaryKey]);

		// Delete existing vector entries for these PKs
		const vectorDelete = q
			.deleteFrom(vectorTableName)
			.where(VTABLE_COLUMN_ORIGINPK, "in", pks)
			.compile();
		commands.push(vectorDelete);

		// Insert new vector entries
		const vectorValues = rows.map(row => ({
			[VTABLE_COLUMN_ORIGINPK]: row[primaryKey],
			...filterAndSerializeVectorColumns(row, table),
		}));

		const vectorInsert = q.insertInto(vectorTableName).values(vectorValues).compile();
		commands.push(vectorInsert);
	}

	return commands;
}
