import { ColumnDataType, CreateTableBuilder, sql } from "kysely";
import { DBColumnType, DBSchema, DBVector, TableName } from "../types";
import { q } from "./util";
import {
	getForeignKeyConstraintName,
	getFTS5VirtualTableName,
	VTABLE_COLUMN_ORIGINPK,
	getPrimaryKeyConstraintName,
	getVectorVirtualTableName,
} from "./naming";

/**
 * Returns the SQL commands to initialize the database schema.
 */
export function cmdCreateTables<S extends DBSchema>(schema: S) {
	const commands = [];

	for (const tableName of Object.keys(schema)) {
		commands.push(createTableCommand(tableName, schema));

		// const cascadeDeletionTriggerCommand = createCascadeDeletionTriggerCommands(tableName, schema);

		// if (cascadeDeletionTriggerCommand) {
		// 	commands.push(cascadeDeletionTriggerCommand);
		// }

		const fts5TableCommand = createFTS5TableCommand(tableName, schema);
		if (fts5TableCommand) {
			commands.push(fts5TableCommand);
			// commands.push(
			// 	createVirtualTableCascadeDeletionTriggerCommand(
			// 		tableName,
			// 		getFTS5VirtualTableName(tableName),
			// 		schema
			// 	)
			// );
		}

		const vectorTableCommand = createVectorTableCommand(tableName, schema);
		if (vectorTableCommand) {
			commands.push(vectorTableCommand);
			// commands.push(
			// 	createVirtualTableCascadeDeletionTriggerCommand(
			// 		tableName,
			// 		getVectorVirtualTableName(tableName),
			// 		schema
			// 	)
			// );
		}
	}

	return commands;
}

/**
 * Creates the SQL commands to create the cascade deletion triggers for the given table.
 *
 * Returns `null` if the table has no foreign keys which reference it.
 */
export function createCascadeDeletionTriggerCommands<S extends DBSchema>(
	tableName: TableName<S>,
	schema: S
) {
	const tableSchema = schema[tableName];
	// stores [table, column] pairs, where column is a foreign key to tableName
	const foreignKeysToTable: [string, string][] = [];

	for (const [otherTableName, otherTableSchema] of Object.entries(schema)) {
		if (otherTableName === tableName) {
			continue;
		}

		for (const columnName of Object.keys(otherTableSchema.columns)) {
			if (
				otherTableSchema.columns[columnName].type === "foreignKey" &&
				otherTableSchema.columns[columnName].table === tableName
			) {
				foreignKeysToTable.push([otherTableName, columnName]);
			}
		}
	}

	if (foreignKeysToTable.length === 0) {
		return null;
	}

	const onDeleteCommands = foreignKeysToTable.map(([otherTableName, columnName]) => {
		return `DELETE FROM ${otherTableName} WHERE ${columnName} = OLD.${tableSchema.primaryKey};`;
	});

	return sql`CREATE TRIGGER IF NOT EXISTS ${sql.raw(
		`${tableName}_cascade_delete_trigger`
	)} AFTER DELETE ON ${sql.raw(tableName)}
	FOR EACH ROW
	BEGIN
		${sql.raw(onDeleteCommands.join("\n"))}
	END;`.compile(q);
}

/**
 * Creates the SQL commands to create the cascade deletion triggers for the given virtual table.
 */
export function createVirtualTableCascadeDeletionTriggerCommand<S extends DBSchema>(
	primaryTableName: TableName<S>,
	virtualTableName: string,
	schema: S
) {
	const primaryTableSchema = schema[primaryTableName];

	return sql`CREATE TRIGGER IF NOT EXISTS ${sql.raw(
		`${primaryTableName}_vt_cascade_delete_trigger`
	)} BEFORE DELETE ON ${sql.raw(primaryTableName)}
	FOR EACH ROW
	BEGIN
		DELETE FROM ${sql.raw(virtualTableName)} WHERE ${sql.raw(VTABLE_COLUMN_ORIGINPK)} = OLD.${sql.raw(
			primaryTableSchema.primaryKey
		)};
	END;`.compile(q);
}

/**
 * Creates the SQL command to create the specified table from the given schema. This table
 * excludes full text search columns, as these will be populated into a separate FTS5 table.
 */
function createTableCommand<S extends DBSchema>(tableName: TableName<S>, schema: S) {
	// ensure primary key is not full text
	const table = schema[tableName];
	if (table.columns[table.primaryKey].type === "fullTextString") {
		throw new Error("Primary key cannot be a full-text column");
	}

	let tableBuilder: CreateTableBuilder<string, string> = q.schema
		.createTable(tableName)
		.ifNotExists();

	const relevantColumns = Object.entries(table.columns).filter(
		([_, column]) => column.type !== "fullTextString" && column.type !== "vector"
	);

	for (const [columnName, column] of relevantColumns) {
		tableBuilder = tableBuilder.addColumn(columnName, typeofColumn(column, schema));

		// Add foreign key constraints, where applicable
		if (column.type === "foreignKey") {
			const foreignKeyTable = schema[column.table as TableName<S>];
			tableBuilder = tableBuilder.addForeignKeyConstraint(
				getForeignKeyConstraintName(tableName, columnName),
				[columnName],
				column.table as TableName<S>,
				[foreignKeyTable.primaryKey],
				cb => cb.onDelete("cascade")
			);
		}
	}

	// set the primary key
	tableBuilder = tableBuilder.addPrimaryKeyConstraint(getPrimaryKeyConstraintName(tableName), [
		table.primaryKey,
	]);

	return tableBuilder.compile();
}

/**
 * Creates the SQL command to create the FTS5 virtual table for the specified schema table
 * consisting of only the full text search columns of the table.
 *
 * Returns `null` if the table has no full text search columns.
 */
function createFTS5TableCommand<S extends DBSchema>(tableName: TableName<S>, schema: S) {
	const relevantColumns = Object.entries(schema[tableName].columns).filter(
		([_, column]) => column.type === "fullTextString"
	);
	const relevantColumnNames = relevantColumns.map(([columnName]) => columnName);

	if (relevantColumns.length === 0) {
		return null;
	}

	return sql`CREATE VIRTUAL TABLE IF NOT EXISTS ${sql.raw(
		getFTS5VirtualTableName(tableName)
	)} USING fts5(
		${sql.raw(VTABLE_COLUMN_ORIGINPK)} UNINDEXED,
		${sql.raw(relevantColumnNames.join(", "))},
		tokenize = 'trigram remove_diacritics 1'
	)`.compile(q);
}

/**
 * Creates the SQL command to create the vector virtual table for the specified schema table.
 */
function createVectorTableCommand<S extends DBSchema>(tableName: TableName<S>, schema: S) {
	const vectorTableName = getVectorVirtualTableName(tableName);
	const relevantColumns: [string, DBVector][] = Object.entries(schema[tableName].columns).filter(
		([_, column]) => column.type === "vector"
	) as [string, DBVector][];

	if (relevantColumns.length === 0) {
		return null;
	}

	const pkType = typeofColumn(schema[tableName].columns[schema[tableName].primaryKey], schema);

	const cols = relevantColumns
		.map(([columnName, column]) => {
			let dtype;

			if (column.dtype === "i8") {
				dtype = "int";
			} else if (column.dtype === "f32") {
				dtype = "float";
			} else {
				throw new Error(`Unsupported vector dtype: ${column.dtype}`);
			}

			return `${columnName} ${dtype}[${column.dim}]`;
		})
		.join(", ");

	return sql`CREATE VIRTUAL TABLE IF NOT EXISTS ${sql.raw(vectorTableName)} USING vec0(${sql.raw(
		VTABLE_COLUMN_ORIGINPK + " " + pkType
	)}, ${sql.raw(cols)})`.compile(q);
}

/**
 * Returns the SQLite type for the given column.
 */
function typeofColumn<S extends DBSchema>(column: DBColumnType, schema: S): ColumnDataType {
	switch (column.type) {
		case "string":
			return "text";
		case "number":
			return "integer";
		case "boolean":
			return "boolean";
		case "bytes":
			return "blob";
		case "fullTextString":
			throw new Error("Full-text columns should not be used in CREATE TABLE statements");
		case "stringArray":
			return "json";
		case "json":
			return "json";
		case "foreignKey":
			const foreignKeyTable = schema[column.table as TableName<S>];
			return typeofColumn(foreignKeyTable.columns[foreignKeyTable.primaryKey], schema);
		case "vector":
			throw new Error("Vectors should not be used in CREATE TABLE statements");
	}
}
