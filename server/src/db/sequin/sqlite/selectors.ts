import { BinaryOperator, ExpressionBuilder, SelectQueryBuilder, sql, WhereInterface } from "kysely";
import { DBSchema, DBForeignKey, DBColumnType, TableName, Query } from "../types";
import {
	getFTS5VirtualTableName,
	getVectorDistanceColumnName,
	getVectorVirtualTableName,
	VTABLE_COLUMN_ORIGINPK,
} from "./naming";
import { WhereCondition, Condition } from "../types/query";
import { getFullTextColumns, getVectorColumns } from "./util";

type ColumnInfo = {
	tableName: string;
	columnName: string;
	columnType: DBColumnType;
};

type ParsedCondition = {
	type: "direct" | "foreign";
	columnName: string;
	columnType: DBColumnType;
	tableName: string;
	operator: string;
	value: any;
	foreign?: {
		tableName: string;
		primaryKey: string;
		columnName: string;
		columnType: DBColumnType;
	};
};

function parseCondition<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	condition: WhereCondition,
	schema: S
): ParsedCondition {
	const { ref, operation, value } = condition;

	if (ref.includes(".")) {
		const [columnName, foreignColumnName] = ref.split(".");
		const foreignTableName = (schema[tableName].columns[columnName] as DBForeignKey<T>).table;

		return {
			type: "foreign",
			columnName,
			columnType: schema[tableName].columns[columnName],
			tableName,
			operator: operation,
			value,
			foreign: {
				tableName: foreignTableName,
				primaryKey: schema[foreignTableName].primaryKey,
				columnName: foreignColumnName,
				columnType: schema[foreignTableName].columns[foreignColumnName],
			},
		};
	}

	if (ref.startsWith("$distance(")) {
		const columnName = ref.slice("$distance(".length, -1);

		return {
			type: "direct",
			columnName,
			columnType: schema[tableName].columns[columnName],
			tableName,
			operator: operation,
			value,
		};
	}

	return {
		type: "direct",
		columnName: ref,
		columnType: schema[tableName].columns[ref],
		tableName,
		operator: operation,
		value,
	};
}

function getColumnInfo(parsed: ParsedCondition): ColumnInfo {
	if (parsed.type === "foreign" && parsed.foreign) {
		return {
			tableName: parsed.foreign.tableName,
			columnName: parsed.foreign.columnName,
			columnType: parsed.foreign.columnType,
		};
	}
	return {
		tableName: parsed.tableName,
		columnName: parsed.columnName,
		columnType: parsed.columnType,
	};
}

function handleArrayOperation(
	column: ColumnInfo,
	operator: string,
	value: any,
	eb: ExpressionBuilder<any, any>
) {
	const fullColumnName = `${column.tableName}.${column.columnName}`;

	switch (operator) {
		case "contains":
		case "doesNotContain": {
			const exists = eb
				.selectFrom(sql`json_each(${sql.raw(fullColumnName)})`.as("arr"))
				.select("value")
				.where("value", "=", value)
				.limit(1);
			return operator === "contains" ? eb.exists(exists) : eb.not(eb.exists(exists));
		}
		case "containsAllOf": {
			const values = value as string[];
			return eb.and(
				values.map(v =>
					eb.exists(
						eb
							.selectFrom(sql`json_each(${sql.raw(fullColumnName)})`.as("arr"))
							.select("value")
							.where("value", "=", v)
							.limit(1)
					)
				)
			);
		}
		case "containsAnyOf": {
			const values = value as string[];
			return eb.exists(
				eb
					.selectFrom(sql`json_each(${sql.raw(fullColumnName)})`.as("arr"))
					.select("value")
					.where("value", "in", values)
					.limit(1)
			);
		}
		case "nonEmpty": {
			return eb.exists(
				eb
					.selectFrom(sql`json_each(${sql.raw(fullColumnName)})`.as("arr"))
					.select("value")
					.limit(1)
			);
		}
		case "isEmpty": {
			return eb.not(
				eb.exists(
					eb
						.selectFrom(sql`json_each(${sql.raw(fullColumnName)})`.as("arr"))
						.select("value")
						.limit(1)
				)
			);
		}
		default:
			throw new Error(`Unsupported array operator: ${operator}`);
	}
}

function handleFullTextOperation(
	column: ColumnInfo,
	operator: string,
	value: string,
	eb: ExpressionBuilder<any, any>
) {
	const fts5TableName = getFTS5VirtualTableName(column.tableName);

	if (operator === "matches") {
		const mainMatch = eb(
			`${fts5TableName}.${VTABLE_COLUMN_ORIGINPK}`,
			"in",
			eb
				.selectFrom(fts5TableName)
				.select(VTABLE_COLUMN_ORIGINPK)
				.where(
					`${fts5TableName}.${column.columnName}`,
					"match",
					value
						.split(" ")
						.filter(Boolean)
						.map(word => `"${word}"`)
						.join(" ")
				)
		);

		if (value.length >= 3) {
			return mainMatch;
		}

		return eb(
			`${fts5TableName}.${VTABLE_COLUMN_ORIGINPK}`,
			"in",
			eb
				.selectFrom(fts5TableName)
				.select(VTABLE_COLUMN_ORIGINPK)
				.where(`${fts5TableName}.${column.columnName}`, "like", value + "%")
		);
	}

	if (operator === "flexiblyMatches") {
		const queryChars = value.replace(/\s/g, "").split("");
		return eb(
			`${fts5TableName}.${VTABLE_COLUMN_ORIGINPK}`,
			"in",
			eb
				.selectFrom(fts5TableName)
				.select(VTABLE_COLUMN_ORIGINPK)
				.where(`${fts5TableName}.${column.columnName}`, "like", "%" + queryChars.join("%") + "%")
		);
	}
}

function handleVectorDistanceOperation(
	column: ColumnInfo,
	operator: string,
	value: number,
	eb: ExpressionBuilder<any, any>
) {
	return eb(
		getVectorDistanceColumnName(column.columnName),
		operator === "lessThan" ? "<" : ">",
		value
	);
}

function handleColumnOperation(
	column: ColumnInfo,
	operator: string,
	value: any,
	eb: ExpressionBuilder<any, any>
) {
	if (column.columnType.type === "stringArray") {
		return handleArrayOperation(column, operator, value, eb);
	}

	if (column.columnType.type === "fullTextString") {
		return handleFullTextOperation(column, operator, value, eb);
	}

	if (column.columnType.type === "vector") {
		return handleVectorDistanceOperation(column, operator, value, eb);
	}

	const fullColumnName = `${column.tableName}.${column.columnName}`;

	// Handle set operations
	switch (operator) {
		case "equalsAnyOf":
			return eb(fullColumnName, "in", value);
		case "notEqualsAnyOf":
			return eb(fullColumnName, "not in", value);
	}

	// Handle string contains operations
	if (operator === "contains" || operator === "notContains") {
		if (column.columnType.type !== "string") {
			throw new Error("Only string columns can be used with the contains operator");
		}
		const condition = eb(
			sql.raw(`lower(${fullColumnName})`),
			"like",
			`%${(value as string).toLowerCase()}%`
		);
		return operator === "contains" ? condition : eb.not(condition);
	}

	if (operator === "flexiblyMatches") {
		if (column.columnType.type !== "string") {
			throw new Error("Only string columns can be used with the flexiblyMatches operator");
		}
		const queryChars = value.replace(/\s/g, "").split("");
		return eb(sql.raw(`lower(${fullColumnName})`), "like", `%${queryChars.join("%")}%`);
	}

	const operatorMap: Record<string, BinaryOperator> = {
		equals: "=",
		notEquals: "!=",
		greaterThan: ">",
		lessThan: "<",
		greaterThanOrEqual: ">=",
		lessThanOrEqual: "<=",
		in: "in",
		notIn: "not in",
	};

	const sqlOperator = operatorMap[operator];
	if (!sqlOperator) {
		throw new Error(`Unknown operator: ${operator}`);
	}

	return eb(fullColumnName, sqlOperator, value);
}

function conditionToWhere<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	condition: WhereCondition,
	schema: S,
	eb: ExpressionBuilder<any, any>
) {
	const parsed = parseCondition(tableName, condition, schema);
	const columnInfo = getColumnInfo(parsed);
	return handleColumnOperation(columnInfo, parsed.operator, parsed.value, eb);
}

function processCondition<T extends TableName<S>, S extends DBSchema>(
	tableName: T,
	condition: Condition,
	schema: S,
	eb: ExpressionBuilder<any, any>
): any {
	switch (condition.type) {
		case "where":
			return conditionToWhere(tableName, condition, schema, eb);
		case "all":
			return eb.and(condition.conditions.map(c => processCondition(tableName, c, schema, eb)));
		case "any":
			return eb.or(condition.conditions.map(c => processCondition(tableName, c, schema, eb)));
		default:
			throw new Error(`Unknown condition type: ${condition}`);
	}
}

/**
 * Creates queries to create temporary tables for vector queries.
 *
 * For instance, say we have
 * ```
 * sentences(id NUMBER, sentence TEXT)
 * vec_sentences(id NUMBER, sentence_embedding FLOAT[768], other_embedding FLOAT[768])
 * ```
 *
 * and we want to do a vector search on the sentences table against both `sentence_embedding` and `other_embedding`. We can create temporary tables
 * with the following SQL:
 * ```sql
 * WITH sentence_embedding_matches AS (
 *    SELECT
 *      "vec_sentences"."id",
 *      "vec_sentences"."sentence_embedding",
 *      "distance"
 *    FROM
 *      vec_sentences
 *    INNER JOIN sentences
 *       ON "sentences"."id" = "vec_sentences"."id"
 *    WHERE "vec_sentences"."sentence_embedding" MATCH ? AND k = ?
 * ),
 * other_embedding_matches AS (
 *    SELECT
 *      "vec_sentences"."id",
 *      "vec_sentences"."other_embedding",
 *      "distance"
 *    FROM
 *      vec_sentences
 *    INNER JOIN sentences
 *       ON "sentences"."id" = "vec_sentences"."id"
 *    WHERE "vec_sentences"."other_embedding" MATCH ? AND k = ?
 * )
 * ```
 *
 * This lets us do a search that lets us combine (possibly) multiple vector searches with a main,
 * non-vector search.
 */
export function vectorTempTables<T extends TableName<S>, S extends DBSchema>(
	query: Query<T>,
	schema: S
): {
	queryPrefix: string;
	tempTables: { tempTableName: string; columnName: string }[];
	params: any[];
} {
	if (!query.vectorQuery) {
		return { queryPrefix: "", tempTables: [], params: [] };
	}

	const vectorColumns = getVectorColumns(schema[query.tableName]);

	const out: string[] = [];
	const tempTables: { tempTableName: string; columnName: string }[] = [];
	const params: any[] = [];

	// For each vector column that has a query, create a temporary table
	for (const columnName of vectorColumns) {
		const v: Float32Array | Int8Array = query.vectorQuery.queryVectors[columnName] as any;

		if (!v) {
			continue;
		}

		const vectorTableName = getVectorVirtualTableName(query.tableName);
		const tempTableName = `${columnName}_matches`;

		out.push(`
${tempTableName} AS (
	SELECT 
		"${vectorTableName}"."${VTABLE_COLUMN_ORIGINPK}",
		"${vectorTableName}"."${columnName}",
		"distance"
	FROM
		${vectorTableName}
	INNER JOIN ${query.tableName}
		ON "${query.tableName}"."${
			schema[query.tableName].primaryKey
		}" = "${vectorTableName}"."${VTABLE_COLUMN_ORIGINPK}"
	WHERE "${vectorTableName}"."${columnName}" MATCH ? AND k = ${query.vectorQuery.k}
)`);

		params.push(v.buffer);
		tempTables.push({ tempTableName, columnName });
	}

	// Return the full WITH clause if there are any temp tables
	if (out.length > 0) {
		return {
			queryPrefix: `WITH ${out.join(",\n")} `,
			tempTables,
			params,
		};
	}

	return {
		queryPrefix: "",
		tempTables: [],
		params: [],
	};
}

export function queryJoins<T extends TableName<S>, S extends DBSchema>(
	tempTables: { tempTableName: string; columnName: string }[],
	query: Query<T>,
	builder: SelectQueryBuilder<any, any, any>,
	schema: S
) {
	const table = schema[query.tableName];
	const fullTextColumns = getFullTextColumns(table);
	const vectorColumns = getVectorColumns(table);

	if (fullTextColumns.length > 0) {
		const fts5TableName = getFTS5VirtualTableName(query.tableName);
		builder = builder.innerJoin(
			fts5TableName,
			`${fts5TableName}.${VTABLE_COLUMN_ORIGINPK}`,
			`${query.tableName}.${schema[query.tableName].primaryKey}`
		);
	}

	// Add joins for vector tables
	if (vectorColumns.length > 0 && query.vectorQuery) {
		// Left join with each temp table to include vector distances
		for (const tempTable of tempTables) {
			builder = builder.leftJoin(
				tempTable.tempTableName,
				`${tempTable.tempTableName}.${VTABLE_COLUMN_ORIGINPK}`,
				`${query.tableName}.${schema[query.tableName].primaryKey}`
			);
		}
	}

	// Collect all foreign key references
	const processConditionForJoins = (condition: Condition): [string, string][] => {
		switch (condition.type) {
			case "where":
				if (condition.ref.includes(".")) {
					const [columnName] = condition.ref.split(".");
					const foreignTableName = (schema[query.tableName].columns[columnName] as DBForeignKey<T>)
						.table;
					return [[foreignTableName, columnName]];
				}
				return [];
			case "all":
			case "any":
				return condition.conditions.flatMap(processConditionForJoins);
			default:
				throw new Error(`Unknown condition type: ${condition}`);
		}
	};

	const joins = query.condition ? processConditionForJoins(query.condition) : [];
	const uniqueJoins = [...new Set(joins.map(j => JSON.stringify(j)))].map(j => JSON.parse(j));

	for (const [foreignTableName, columnName] of uniqueJoins) {
		builder = builder.innerJoin(
			foreignTableName,
			`${foreignTableName}.${schema[foreignTableName].primaryKey}`,
			`${query.tableName}.${columnName}`
		);
	}

	return builder;
}

export function queryWheres<
	K extends WhereInterface<any, any>,
	T extends TableName<S>,
	S extends DBSchema,
>(query: Query<T>, builder: K, schema: S): K {
	if (!query.condition) {
		return builder;
	}

	return builder.where(eb => processCondition(query.tableName, query.condition!, schema, eb)) as K;
}
