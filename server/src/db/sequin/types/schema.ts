/**
 * welcome to the worlds greatest type system of all time
 */

type BaseDBTypeFlags = {
	/**
	 * If true, the column value will not be replaced on upsert conflict.
	 */
	noReplaceOnUpsert?: boolean;
};

export interface DBNumber extends BaseDBTypeFlags {
	type: "number";
	__jstype: number;
}

export interface DBBoolean extends BaseDBTypeFlags {
	type: "boolean";
	__jstype: boolean;
}

export interface DBString extends BaseDBTypeFlags {
	type: "string";
	maxLength?: number;
	__jstype: string;
}

export interface DBStringEnum<T extends string> extends BaseDBTypeFlags {
	type: "string";
	__jstype: T;
}

export interface DBStringArray extends BaseDBTypeFlags {
	type: "stringArray";
	__jstype: string[];
}

export interface DBJSON<T> extends BaseDBTypeFlags {
	type: "json";
	__jstype: T;
}

export interface DBBytes extends BaseDBTypeFlags {
	type: "bytes";
	__jstype: Uint8Array;
}

export interface DBFullTextString extends BaseDBTypeFlags {
	type: "fullTextString";
	__jstype: string;
}

export interface DBForeignKey<T> extends BaseDBTypeFlags {
	type: "foreignKey";
	table: T;
	__jstype: unknown;
}

export interface DBVector<T = unknown> extends BaseDBTypeFlags {
	type: "vector";
	dim: number;
	dtype: "f32" | "i8";
	__jstype: T;
}

export type DBColumnType<T = unknown> =
	| DBNumber
	| DBBoolean
	| DBString
	| DBBytes
	| DBFullTextString
	| DBForeignKey<T>
	| DBStringArray
	| DBJSON<T>
	| DBVector<T>;

export type DBColumns = Record<string, DBColumnType>;

export type DBTable<C extends DBColumns = Record<any, DBColumnType>, P extends keyof C = any> = {
	columns: C;
	primaryKey: P;
};

/**
 * A schema is a collection of tables, where each table has columns and a primary key.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBColumnNumber;
 *       name: DBColumnString;
 *       bio: DBFullTextString;
 *     };
 *     primaryKey: "id";
 *   };
 *   posts: {
 *     columns: {
 *       id: DBColumnNumber;
 *       title: DBColumnString;
 *       content: DBFullTextString;
 *       authorId: DBForeignKey<"users">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 * ```
 */
export type DBSchema = Record<string, DBTable<Record<any, DBColumnType>, any>>;

//// UTILITY TYPES ////

/**
 * Type of the forward serializable foreign key column type. For example, if the foreign key is to a "users" table,
 * where the "users" table has a primary key of "id", the type will be the type of the "id" column.
 */
type _ResolveForeignKeyType<
	T extends DBForeignKey<keyof S>,
	S extends DBSchema,
> = S[T["table"]]["columns"][S[T["table"]]["primaryKey"]]["__jstype"];

/**
 * Type of the forward serializable type given a column type and a schema. The schema is used to resolve
 * foreign keys.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 *   comments: {
 *     columns: {
 *       id: DBNumber;
 *       userID: DBForeignKey<"users">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * // Non-foreign key example:
 * type T1 = JSTypeOfColumn<DBNumber, Schema>; // number
 *
 * // Foreign key example:
 * type T2 = JSTypeOfColumn<DBForeignKey<"users">, Schema>; // number (type of users.id)
 * ```
 */
export type JSTypeOfColumn<T extends DBColumnType, S extends DBSchema> = T extends DBForeignKey<
	keyof S
>
	? _ResolveForeignKeyType<T, S>
	: T["__jstype"];

/**
 * Type of the forward-serializable row type given a table type and schema. The schema is used to resolve
 * foreign keys in the table's columns.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 *   comments: {
 *     columns: {
 *       id: DBNumber;
 *       userID: DBForeignKey<"users">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = JSTypeOfTableRow<Schema["comments"], Schema>;
 * // {
 * //   id: number;
 * //   userID: number; // Type of users.id
 * // }
 * ```
 */
type JSTypeOfTableRow<T extends DBTable<any, any>, S extends DBSchema> = {
	[K in keyof T["columns"]]: JSTypeOfColumn<T["columns"][K], S>;
};

/**
 * Same as {@link JSTypeOfTableRow}, but given a table name instead of a table.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = JSTypeOfTableRowByName<"users", Schema>;
 * // {
 * //   id: number;
 * //   name: string;
 * // }
 * ```
 */
type JSTypeOfTableRowByName<T extends keyof S, S extends DBSchema> = JSTypeOfTableRow<S[T], S>;
export type VectorDistanceColumnName<T extends string> = `$distance_${T}`;
export type VectorDistancesOfTableRow<T extends TableName<S>, S extends DBSchema> = {
	[K in OnlyColumnsWithType<T, DBVector<any>, S> as VectorDistanceColumnName<K>]: number | null;
};

export type RowReverseSerialized<
	T extends TableName<S>,
	S extends DBSchema,
> = JSTypeOfTableRowByName<T, S>;

export type RowForwardSerialized<T extends TableName<S>, S extends DBSchema> = Omit<
	JSTypeOfTableRowByName<T, S> & VectorDistancesOfTableRow<T, S>,
	// exclude embedding vectors from the type of the result set. this saves memory bandwidth.
	// also, we figure that you would never really need to access the embedding of a row directly
	// since it's only used for internal vector computations.
	OnlyColumnsWithType<T, DBVector<any>, S>
>;

/**
 * Type of the forward-serializable row type given a table type and schema, with foreign keys resolved
 * to their referenced table's row type instead of just the primary key.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 *   comments: {
 *     columns: {
 *       id: DBNumber;
 *       userID: DBForeignKey<"users">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = JSTypeOfTableRowWithFKeysResolved<"comments", Schema>;
 * // {
 * //   id: number;
 * //   userID: { id: number, name: string }; // Full user object instead of just ID
 * // }
 * ```
 */
export type RowForwardSerializedFKeysResolved<T extends TableName<S>, S extends DBSchema> = {
	[K in keyof S[T]["columns"]]: S[T]["columns"][K] extends DBForeignKey<keyof S>
		? JSTypeOfTableRowByName<S[T]["columns"][K]["table"], S>
		: JSTypeOfColumn<S[T]["columns"][K], S>;
} & VectorDistancesOfTableRow<T, S>;

/**
 * Returns the name of the table that a foreign key references, assuming that the column is a foreign key.
 * If the column is not a foreign key, returns `never`.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *     };
 *     primaryKey: "id";
 *   };
 *   comments: {
 *     columns: {
 *       id: DBNumber;
 *       userID: DBForeignKey<"users">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T1 = ReferencedTableName<DBForeignKey<"users">, Schema>; // "users"
 * type T2 = ReferencedTableName<DBNumber, Schema>; // never; DBNumber is not of type DBForeignKey
 * ```
 */
export type ReferencedTableName<
	Col extends DBColumnType,
	S extends DBSchema,
> = Col extends DBForeignKey<keyof S>
	? Col["table"] extends keyof S & string
		? Col["table"]
		: never
	: never;

/**
 * Returns the columns of a table given the name of the table and the schema.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = TableColumns<"users", Schema>; // { id: DBNumber; name: DBString; }
 * ```
 */
export type TableColumns<T extends keyof S, S extends DBSchema> = S[T]["columns"];

/**
 * Returns the columns of a table given the name of the table and the schema. Shorthand for `S[T]["columns"]`.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = TableColumnNames<"users", Schema>; // "id" | "name"
 * ```
 */
export type TableColumnNames<T extends keyof S, S extends DBSchema> = keyof S[T]["columns"] &
	string;

/**
 * Returns the columns of a table that are foreign keys, given the name of the table and the schema.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *     };
 *     primaryKey: "id";
 *   };
 *   comments: {
 *     columns: {
 *       id: DBNumber;
 *       userID: DBForeignKey<"users">;
 *       parentID: DBForeignKey<"comments">;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = OnlyForeignKeyColumnNames<"comments", Schema>; // "userID" | "parentID"
 * ```
 */
export type OnlyForeignKeyColumnNames<T extends TableName<S>, S extends DBSchema> = {
	[K in TableColumnNames<T, S>]: TableColumns<T, S>[K] extends DBForeignKey<keyof S> ? K : never;
}[TableColumnNames<T, S>];

export type OnlyColumnsWithType<
	T extends keyof S,
	CT extends DBColumnType<keyof S>,
	S extends DBSchema,
> = {
	[K in TableColumnNames<T, S>]: TableColumns<T, S>[K] extends CT ? K : never;
}[TableColumnNames<T, S>];

/**
 * Given:
 * - A table name `T`
 * - A column name `C` in `T`
 * - A schema `S`
 * Returns the type of `C`.
 *
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBColumnNumber;
 *       name: DBColumnString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = DBTypeOfColumn<"users", "id", Schema>; // DBColumnNumber
 * type U = DBTypeOfColumn<"users", "name", Schema>; // DBColumnString
 * ```
 */
export type DBTypeOfColumn<
	T extends keyof S,
	C extends TableColumnNames<T, S>,
	S extends DBSchema,
> = S[T]["columns"][C];

/**
 * A string literal type representing a valid table name in a schema.
 * @example
 * ```ts
 * type Schema = {
 *   users: { ... };
 *   posts: { ... };
 * };
 *
 * type T = TableName<Schema>; // "users" | "posts"
 * ```
 */
export type TableName<S extends DBSchema> = keyof S & string;

/**
 * A string literal type representing a valid column name in a table.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = ColumnName<"users", Schema>; // "id" | "name"
 * ```
 */
export type ColumnName<T extends TableName<S>, S extends DBSchema> = TableColumnNames<T, S> &
	string;

/**
 * A string literal type representing the primary key column name of a table.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: { ... };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = PrimaryKeyName<"users", Schema>; // "id"
 * ```
 */
export type PrimaryKeyName<T extends TableName<S>, S extends DBSchema> = S[T]["primaryKey"];

/**
 * The column type of a table's primary key.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = DBTypeOfPrimaryKey<"users", Schema>; // DBNumber
 * ```
 */
export type DBTypeOfPrimaryKey<
	T extends TableName<S>,
	S extends DBSchema,
> = S[T]["columns"][PrimaryKeyName<T, S>];

/**
 * The JavaScript type of a table's primary key value.
 * @example
 * ```ts
 * type Schema = {
 *   users: {
 *     columns: {
 *       id: DBNumber;
 *       name: DBString;
 *     };
 *     primaryKey: "id";
 *   };
 * };
 *
 * type T = JSTypeOfPrimaryKey<"users", Schema>; // number
 * ```
 */
export type JSTypeOfPrimaryKey<T extends TableName<S>, S extends DBSchema> = JSTypeOfColumn<
	DBTypeOfPrimaryKey<T, S>,
	S
>;
