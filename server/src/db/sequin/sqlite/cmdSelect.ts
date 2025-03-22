import { SelectQueryBuilder, sql, ValueExpression } from "kysely";
import { DBSchema, TableName, JSTypeOfPrimaryKey, Query } from "../types";
import { getFullTextColumns, q } from "./util";
import {
	VTABLE_COLUMN_ORIGINPK,
	getFTS5VirtualTableName,
	getVectorDistanceColumnName,
} from "./naming";
import { queryJoins, queryWheres, vectorTempTables } from "./selectors";

/**
 * Generates the SQL command for a SELECT query.
 */
export function cmdSelect<T extends TableName<S>, S extends DBSchema>(
	query: Query<T>,
	schema: S,
	limit: number | undefined
) {
	let builder: SelectQueryBuilder<any, any, any> = q.selectFrom([query.tableName]);
	const { queryPrefix, tempTables, params } = vectorTempTables(query, schema);
	builder = queryJoins(tempTables, query, builder, schema);
	builder = queryWheres(query, builder, schema);

	builder = builder.selectAll(query.tableName);

	for (const tempTable of tempTables) {
		builder = builder.select([
			tempTable.tempTableName + "." + tempTable.columnName,
			// tempTable.tempTableName + ".distance as " + getVectorDistanceColumnName(tempTable.columnName),
			sql.raw(
				`coalesce("${tempTable.tempTableName}".distance, 1e999) as "${getVectorDistanceColumnName(
					tempTable.columnName
				)}"`
			) as any,
		]);
	}

	// check if there are any full-text columns in the queried table; if so, also select those
	const table = schema[query.tableName];
	const fullTextColumns = getFullTextColumns(table);

	if (fullTextColumns.length > 0) {
		builder = builder.selectAll(getFTS5VirtualTableName(query.tableName));
	}

	if (limit) {
		builder = builder.limit(limit);
	}

	if (query.sortBy) {
		builder = builder.orderBy(query.tableName + "." + query.sortBy.column, query.sortBy.direction);
	}

	const compiled = builder.compile();

	return {
		sql: queryPrefix + compiled.sql,
		parameters: [...params, ...compiled.parameters],
	};
}

export function cmdSelectByPrimaryKeys<T extends TableName<S>, S extends DBSchema>(
	table: T,
	schema: S,
	primaryKeys: JSTypeOfPrimaryKey<T, S>[]
) {
	const pk = schema[table].primaryKey;

	let builder: SelectQueryBuilder<any, any, any> = q
		.selectFrom([table])
		.where(table + "." + pk, "in", primaryKeys as ValueExpression<any, any, any>[]);

	builder = builder.selectAll(table);

	// Check if there are any full-text columns and join them if present
	const tableSchema = schema[table];
	const fullTextColumns = getFullTextColumns(tableSchema);

	if (fullTextColumns.length > 0) {
		const ftsTable = getFTS5VirtualTableName(table);
		builder = builder
			.leftJoin(ftsTable, `${table}.${pk}`, `${ftsTable}.${VTABLE_COLUMN_ORIGINPK}`)
			.selectAll(ftsTable);
	}

	return builder.compile();
}
