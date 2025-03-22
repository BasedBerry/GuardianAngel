import {
	ColumnName,
	DBStringArray,
	DBForeignKey,
	DBFullTextString,
	DBSchema,
	DBTypeOfColumn,
	ReferencedTableName,
	OnlyColumnsWithType,
	PrimaryKeyName,
	TableName,
	DBNumber,
	DBString,
	DBBoolean,
	DBVector,
	RowReverseSerialized,
} from "./schema";

type Merge<U extends Record<string, unknown>> = {
	[K in U extends unknown ? keyof U : never]: U extends unknown
		? K extends keyof U
			? U[K]
			: never
		: never;
};

export type Operation<A> = (arg: A) => void;

export type ColumnOperations<
	Constraint,
	Ops extends Record<string, Operation<any>>,
	Col,
> = Col extends Constraint ? Ops : {};

export type PrimitiveColumnOperations<Col> = Col extends DBNumber | DBString | DBBoolean
	? {
			/**
			 * Evaluates to true if the column value is equal to the given value.
			 */
			equals: (arg: Col["__jstype"]) => WhereCondition;
			/**
			 * Evaluates to true if the column value is not equal to the given value.
			 */
			notEquals: (arg: Col["__jstype"]) => WhereCondition;
			/**
			 * Evaluates to true if the column value is equal to any of the given values.
			 */
			equalsAnyOf: (arg: Col["__jstype"][]) => WhereCondition;
			/**
			 * Evaluates to true if the column value is not equal to any of the given values.
			 */
			notEqualsAnyOf: (arg: Col["__jstype"][]) => WhereCondition;
	  }
	: {};

export type StringColumnOperations<Col> = ColumnOperations<
	DBString,
	{
		/**
		 * Evaluates to true if the column value contains the given query string.
		 */
		contains: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value does not contain the given query string.
		 */
		notContains: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value contains any of the given query strings.
		 */
		containsAnyOf: (arg: string[]) => WhereCondition;

		/**
		 * Evaluates to true if the column value does not contain any of the given query strings.
		 */
		notContainsAnyOf: (arg: string[]) => WhereCondition;

		/**
		 * Experimental
		 */
		flexiblyMatches: (arg: string) => WhereCondition;
	},
	Col
>;

export type NumberColumnOperations<Col> = ColumnOperations<
	DBNumber,
	{
		/**
		 * Evaluates to true if the column value is greater than the given value.
		 */
		greaterThan: (arg: number) => WhereCondition;

		/**
		 * Evaluates to true if the column value is less than the given value.
		 */
		lessThan: (arg: number) => WhereCondition;

		/**
		 * Evaluates to true if the column value is greater than or equal to the given value.
		 */
		greaterThanOrEqual: (arg: number) => WhereCondition;

		/**
		 * Evaluates to true if the column value is less than or equal to the given value.
		 */
		lessThanOrEqual: (arg: number) => WhereCondition;
	},
	Col
>;

export type FullTextColumnOperations<Col> = ColumnOperations<
	DBFullTextString,
	{
		/**
		 * Evaluates to true if the column value matches the given query string.
		 */
		matches: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value does not match the given query string.
		 */
		notMatches: (arg: string) => WhereCondition;

		/**
		 * Experimental
		 */
		flexiblyMatches: (arg: string) => WhereCondition;
	},
	Col
>;

export type ArrayColumnOperations<Col> = ColumnOperations<
	DBStringArray,
	{
		/**
		 * Evaluates to true if the column value contains an exact match of the given string.
		 */
		contains: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value does not contain an exact match of the given string.
		 */
		doesNotContain: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value contains an element for which the query string is a substring.
		 */
		partiallyContains: (arg: string) => WhereCondition;

		/**
		 * Evaluates to true if the column value contains all of the given strings.
		 */
		containsAllOf: (arg: string[]) => WhereCondition;

		/**
		 * Evaluates to true if the column value contains at least one of the given strings.
		 */
		containsAnyOf: (arg: string[]) => WhereCondition;

		/**
		 * Evaluates to true if the column value is not empty.
		 */
		nonEmpty: () => WhereCondition;

		/**
		 * Evaluates to true if the column value is empty.
		 */
		isEmpty: () => WhereCondition;
	},
	Col
>;

export type VectorColumnOperations<Col> = ColumnOperations<
	DBVector,
	{
		lessThan: (arg: number) => WhereCondition;
		greaterThan: (arg: number) => WhereCondition;
	},
	Col
>;

export type AllColumnOperations<Col> =
	| PrimitiveColumnOperations<Col>
	| StringColumnOperations<Col>
	| NumberColumnOperations<Col>
	| FullTextColumnOperations<Col>
	| ArrayColumnOperations<Col>
	| VectorColumnOperations<Col>;

export type WhereOperations<Col> = Merge<AllColumnOperations<Col>>;

export type DirectColumnReference<
	T extends TableName<S>,
	C extends ColumnName<T, S>,
	S extends DBSchema,
> = C extends OnlyColumnsWithType<T, DBForeignKey<keyof S> | DBVector<any>, S> ? never : `${C}`;

export type ForeignKeyColumnReference<
	T extends TableName<S>,
	C extends ColumnName<T, S>,
	CR extends ColumnName<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, S>,
	S extends DBSchema,
> = C extends OnlyColumnsWithType<T, DBForeignKey<keyof S>, S> ? `${C}.${CR}` : never;

export type VectorColumnDistanceReference<
	T extends TableName<S>,
	C extends ColumnName<T, S>,
	S extends DBSchema,
> = C extends OnlyColumnsWithType<T, DBVector<any>, S> ? `$distance(${C})` : never;

export type ColumnReference<
	T extends TableName<S>,
	C extends ColumnName<T, S>,
	CR extends ColumnName<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, S>,
	S extends DBSchema,
> =
	| DirectColumnReference<T, C, S>
	| ForeignKeyColumnReference<T, C, CR, S>
	| VectorColumnDistanceReference<T, C, S>;

/**
 * If C extends `ForeignKeyColumnReference<T, C, CR, S>`, returns `T2[CR]` where `T2 = ReferencedTableName<DBTypeOfColumn<T, C, S>, S>`
 */
export type TypeOfColumnBeingReferenced<
	T extends TableName<S>,
	C extends ColumnName<T, S>,
	CR extends ColumnName<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, S>,
	S extends DBSchema,
> = DBTypeOfColumn<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, CR, S> extends never
	? DBTypeOfColumn<T, C, S>
	: DBTypeOfColumn<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, CR, S>;

export type WhereCondition = {
	type: "where";
	ref: string;
	operation: string;
	value: any;
};

export type AllCondition = {
	type: "all";
	conditions: Condition[];
};

export type AnyCondition = {
	type: "any";
	conditions: Condition[];
};

export type Condition = WhereCondition | AllCondition | AnyCondition;

export type Query<T extends string> = {
	tableName: T;
	condition: Condition | null;
	sortBy?: {
		column: string;
		direction: "asc" | "desc";
	};
	vectorQuery?: KNNVectorQuery<any, any>;
};

export type UpdateRowPayload<T extends TableName<S>, S extends DBSchema> = Partial<
	RowReverseSerialized<T, S>
> & {
	[K in PrimaryKeyName<T, S>]: RowReverseSerialized<T, S>[K];
};

type VectorTypeForVectorColumn<
	C extends ColumnName<T, S>,
	T extends TableName<S>,
	S extends DBSchema,
> = S[T]["columns"][C] extends DBVector<infer D> ? D : never;

export type KNNVectorQuery<T extends TableName<S>, S extends DBSchema> = {
	queryVectors: Partial<{
		[C in OnlyColumnsWithType<T, DBVector<any>, S>]: VectorTypeForVectorColumn<C, T, S>;
	}>;
	k: number;
};
