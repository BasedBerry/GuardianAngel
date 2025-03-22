import {
	DBBoolean,
	DBBytes,
	DBNumber,
	DBColumns,
	DBString,
	DBForeignKey,
	DBFullTextString,
	DBSchema,
	DBTable,
	DBStringArray,
	DBColumnType,
	DBJSON,
	DBVector,
	DBStringEnum,
} from "./types";

/**
 * Shorthand for creating column types.
 */
export const DBType = {
	number: {
		type: "number",
		__jstype: 0,
	} as DBNumber,

	boolean: {
		type: "boolean",
		__jstype: false,
	} as DBBoolean,

	string: {
		type: "string",
		__jstype: "",
	} as DBString,

	stringArray: {
		type: "stringArray",
		__jstype: [],
	} as DBStringArray,

	bytes: {
		type: "bytes",
		__jstype: new Uint8Array(),
	} as DBBytes,

	fullTextString: {
		type: "fullTextString",
		__jstype: "",
	} as DBFullTextString,

	foreignKey: <T extends keyof S, S extends DBSchema>(table: T) =>
		({
			type: "foreignKey",
			table,
			__jstype: "",
		}) as DBForeignKey<T>,

	json: <T>() =>
		({
			type: "json",
			__jstype: {},
		}) as DBJSON<T>,

	vectorFloat32: (dim: number) =>
		({
			type: "vector",
			dim,
			dtype: "f32",
			__jstype: {},
		}) as DBVector<Float32Array>,

	vectorInt8: (dim: number) =>
		({
			type: "vector",
			dim,
			dtype: "i8",
			__jstype: {},
		}) as DBVector<Int8Array>,

	stringEnum: <T extends string>() =>
		({
			type: "string",
			__jstype: {} as any,
		}) as DBStringEnum<T>,
};

export function createSchema<T extends DBSchema>(schema: T) {
	return schema;
}

export function createTable<C extends DBColumns, P extends keyof C>(table: DBTable<C, P>) {
	return table;
}

export const DBColumnFlags = {
	/**
	 * Indicates that the value of this column should not be replaced when upserting and a row
	 * with the same primary key already exists.
	 *
	 * For instance,
	 * ```ts
	 * const schema = createSchema({
	 *   users: {
	 *     columns: {
	 *       id: DBType.number,
	 *       name: DBColumnFlags.noReplaceOnUpsert(DBType.string),
	 *       age: DBType.number,
	 *     },
	 *     primaryKey: "id",
	 *   },
	 * });
	 *
	 * upsertUser({
	 *   id: 1,
	 *   name: "John",
	 *   age: 20,
	 * }); // This will insert a new user with id 1, name "John", and age 20.
	 *
	 * upsertUser({
	 *   id: 1,
	 *   name: "Jane",
	 *   age: 21,
	 * }); // This will update the age of the user with id 1 to 21, but will not update the name.
	 * ```
	 */
	noReplaceOnUpsert: <T extends DBColumnType>(column: T) =>
		({
			...column,
			noReplaceOnUpsert: true,
		}) as T & { noReplaceOnUpsert: true },
};
