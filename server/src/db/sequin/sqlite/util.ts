import {
	DummyDriver,
	Kysely,
	sql,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from "kysely";
import { DBSchema, TableName } from "../types";

export const q = new Kysely<Record<string, any>>({
	dialect: {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new DummyDriver(),
		createIntrospector: q => new SqliteIntrospector(q),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	},
});

/**
 * Returns an object containing only the non-full-text columns from the input row.
 */
export function filterNonVirtualColumns(
	row: Record<string, any>,
	table: { columns: Record<string, { type: string }> }
) {
	return Object.fromEntries(
		Object.entries(row).filter(
			([columnName]) =>
				table.columns[columnName].type !== "fullTextString" &&
				table.columns[columnName].type !== "vector"
		)
	);
}

/**
 * Returns an object containing only the full-text columns from the input row.
 */
export function filterFullTextColumns(
	row: Record<string, any>,
	table: { columns: Record<string, { type: string }> }
) {
	return Object.fromEntries(
		Object.entries(row).filter(
			([columnName]) => table.columns[columnName].type === "fullTextString"
		)
	);
}

/**
 * Returns an object containing only the vector columns from the input row.
 */
export function filterAndSerializeVectorColumns(
	row: Record<string, any>,
	table: { columns: Record<string, { type: string }> }
) {
	return Object.fromEntries(
		Object.entries(row)
			.filter(([columnName]) => table.columns[columnName].type === "vector")
			.map(([columnName, value]) => [columnName, (value as Float32Array | Int8Array).buffer])
	);
}

/**
 * Returns the names of full-text columns in the table.
 */
export function getFullTextColumns(table: { columns: Record<string, { type: string }> }) {
	return Object.entries(table.columns)
		.filter(([_, column]) => column.type === "fullTextString")
		.map(([columnName]) => columnName);
}

export function getVectorColumns(table: { columns: Record<string, { type: string }> }) {
	return Object.entries(table.columns)
		.filter(([_, column]) => column.type === "vector")
		.map(([columnName]) => columnName);
}

/**
 * Serializes the values of a row for insertion into a table.
 *
 * Wraps arrays and JSON columns in `json()` functions.
 */
export function jsonSerializeColumnsForInsert<T extends TableName<S>, S extends DBSchema>(
	schema: S,
	tableName: T,
	values: Record<string, any>
) {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => {
			const column = schema[tableName].columns[key];

			if (column?.type === "stringArray" || column?.type === "json") {
				return [key, sql`json(${JSON.stringify(value)})`];
			}
			return [key, value];
		})
	);
}

export function normalizeString(str: string) {
	return str.replace("”", '"').replace("“", '"').replace("’", "'").replace("‘", "'");
}

export function normalizeStringValues(values: Record<string, string>) {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, normalizeString(value)])
	);
}
