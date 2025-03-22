/**
 * Utility functions for naming SQLite objects, constraints, and so on.
 */

import { VectorDistanceColumnName } from "../types/schema";

/**
 * Returns the name of the FTS5 virtual table for the specified table.
 */
export function getFTS5VirtualTableName(tableName: string) {
	return `${tableName}_fts5`;
}

export function getVectorVirtualTableName(tableName: string) {
	return `${tableName}_vector`;
}

/**
 * Returns the name of the foreign key constraint for the specified table and column.
 */
export function getForeignKeyConstraintName(tableName: string, columnName: string) {
	return `${tableName}_${columnName}_fk`;
}

/**
 * Returns the name of the primary key constraint for the specified table.
 */
export function getPrimaryKeyConstraintName(tableName: string) {
	return `${tableName}_pk`;
}

/**
 * The name of the column that stores the primary key of the corresponding row in the original table.
 */
export const VTABLE_COLUMN_ORIGINPK = "originPK";

export function getVectorDistanceColumnName<T extends string>(
	columnName: T
): VectorDistanceColumnName<T> {
	return `$distance_${columnName}`;
}
