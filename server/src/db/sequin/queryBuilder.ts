import {
	ColumnName,
	DBSchema,
	DBTypeOfColumn,
	ReferencedTableName,
	Simplify,
	TableName,
} from "./types";
import {
	AllCondition,
	AnyCondition,
	ColumnReference,
	Condition,
	KNNVectorQuery,
	Query,
	TypeOfColumnBeingReferenced,
	WhereCondition,
	WhereOperations,
} from "./types/query";

/**
 * A builder for building queries for a table
 */
export class TableQueryBuilder<T extends TableName<S>, S extends DBSchema> {
	public condition: Condition | null = null;
	public sortByClause?: {
		column: string;
		direction: "asc" | "desc";
	};

	public suppressed: boolean = false;
	public _vectorQuery?: KNNVectorQuery<T, S>;

	constructor(
		public tableName: T,
		public schema: S
	) {}

	/**
	 * Creates a where clause for a column reference
	 */
	private _where<
		C extends ColumnName<T, S>,
		CR extends ColumnName<ReferencedTableName<DBTypeOfColumn<T, C, S>, S>, S>,
	>(ref: ColumnReference<T, C, CR, S>): WhereOperations<TypeOfColumnBeingReferenced<T, C, CR, S>> {
		return new Proxy({} as any, {
			get(_, prop: string) {
				return (value: any) => {
					const condition: WhereCondition = {
						type: "where",
						ref,
						operation: prop,
						value,
					};
					return condition;
				};
			},
		});
	}

	/**
	 * Combines multiple conditions with AND
	 */
	private _all(...conditions: MaybeCondition[]): AllCondition {
		return {
			type: "all",
			conditions: conditions.filter(Boolean) as Condition[],
		};
	}

	/**
	 * Combines multiple conditions with OR
	 */
	private _any(...conditions: MaybeCondition[]): AnyCondition {
		return {
			type: "any",
			conditions: conditions.filter(Boolean) as Condition[],
		};
	}

	/**
	 * Adds sorting criteria to the query
	 */
	sortBy(column: ColumnName<T, S>, direction: "asc" | "desc" = "asc"): this {
		this.sortByClause = { column, direction };
		return this;
	}

	/**
	 * Computes the vector distances for the given queries against the vector columns in the table.
	 * This is required if you want your query to return vector distances, or if your query also
	 * depends on said vector distances (e.g. filtering for rows with a vector distance less than some threshold).
	 *
	 * The vector search extension for SQLite also requires a `k` parameter (as in k nearest neighbors).
	 * What this means is that you can only specify that the distances to the top `k` nearest neighbors should be computed.
	 * This is a limitation of the extension, and there is not much we can do about it.
	 *
	 * - If a row is returned (because it matched the query) but its distance was not computed, because it
	 * was not one of the top `k` nearest neighbors, then the distance value will be `infinity`. The reason we
	 * use `infinity` instead of `NULL` is so that we can still use the distance value in conditions, under
	 * the assumption that it is just very large. This should highlight the importance of setting the `k` parameter
	 * appropriately.
	 * - If you do not call this method, then the distance values for all vector columns will be `null`.
	 * - If you do not call this method, you must not condition the query on the distance values (otherwise the query will fail).
	 *
	 * @param queries - A mapping of vector columns to query vectors
	 * @param k - The number of nearest neighbors to compute for each query
	 *
	 * @example
	 * ```
	 * const query = db.fromTable("embeddings").withVectorDistances({ queries: { embedding: new Float32Array([1, 2, 3, 4]) }, k: 10 })
	 * ```
	 */
	withVectorDistances(q: Simplify<KNNVectorQuery<T, S>>): this {
		this._vectorQuery = q;
		return this;
	}

	/**
	 * Adds an additional condition to the query as an AND condition.
	 *
	 * @example
	 * ```
	 * const query1: TableQueryBuilder = [ A and B ]
	 * query1.and([ C ]) // [ A and B and C ]
	 *
	 * const query2: TableQueryBuilder = [ A or B ]
	 * query2.and([ C ]) // [ (A or B) and C ]
	 * query2.and([ D ]) // [ (A or B) and C and D ]
	 *
	 * const query3: TableQueryBuilder = []
	 * query3.and([ A ]) // [ A ]
	 * ```
	 */
	and(builder: BuilderFunction<T, S>): this {
		const helpers = {
			where: this._where.bind(this),
			all: this._all.bind(this),
			any: this._any.bind(this),
		};

		const newCondition = builder(helpers);

		if (!newCondition) {
			return this;
		}

		if (this.condition) {
			if (this.condition.type === "all") {
				this.condition.conditions.push(newCondition);
			} else {
				this.condition = {
					type: "all",
					conditions: [this.condition, newCondition],
				};
			}
		} else {
			this.condition = newCondition;
		}

		return this;
	}

	/**
	 * Returns the final query object
	 */
	toQuery(): Query<T> {
		return {
			tableName: this.tableName,
			condition: this.condition,
			sortBy: this.sortByClause,
			vectorQuery: this._vectorQuery,
		};
	}

	/**
	 * If called, the query will return no results.
	 */
	suppress(): this {
		this.suppressed = true;
		return this;
	}
}

export type BuilderFunction<T extends TableName<S>, S extends DBSchema> = (helpers: {
	/**
	 * Creates a where clause that can be used to create a condition on a given column.
	 *
	 * @example
	 * ```
	 * where("column").equals("value")
	 * ```
	 */
	where: TableQueryBuilder<T, S>["_where"];

	/**
	 * Combines multiple conditions with AND.
	 *
	 * @example
	 * ```
	 * all(where("column1").equals("value1"), where("column2").equals("value2"))
	 * ```
	 */
	all: TableQueryBuilder<T, S>["_all"];

	/**
	 * Combines multiple conditions with OR.
	 *
	 * @example
	 * ```
	 * any(where("column1").equals("value1"), where("column2").equals("value2"))
	 * ```
	 */
	any: TableQueryBuilder<T, S>["_any"];
}) => MaybeCondition;

type MaybeCondition = Condition | false | null | undefined;
