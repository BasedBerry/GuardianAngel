import { BuilderFunction, TableQueryBuilder } from "./queryBuilder";
import {
	cmdDeleteMany,
	cmdUpsertMany,
	cmdInsert,
	cmdSelect,
	cmdUpdate,
	cmdCreateTables,
	cmdSelectByPrimaryKeys,
	cmdUpdateMany,
	cmdInsertMany,
} from "./sqlite";
import { cmdGarbageCollectAllTables, cmdGarbageCollectSingleTable } from "./sqlite/cmdGC";
import {
	getFTS5VirtualTableName,
	getVectorDistanceColumnName,
	getVectorVirtualTableName,
} from "./sqlite/naming";
import {
	DBSchema,
	UpdateRowPayload,
	SQLiteDatabaseConnection,
	JSTypeOfPrimaryKey,
	RowForwardSerializedFKeysResolved,
	DBForeignKey,
	TableName,
	Simplify,
	RowForwardSerialized,
	RowReverseSerialized,
} from "./types";
import { Query } from "./types/query";
import { cmdStat } from "./sqlite/cmdStat";
import { getFullTextColumns, getVectorColumns } from "./sqlite/util";
import { DBObserver } from "./observer";

/**
 * A high-level database interface. Accepts a database schema and an object implementing the
 * asynchronous `SQLiteConnection` interface.
 */
export class Database<
	S extends DBSchema,
	C extends SQLiteDatabaseConnection = SQLiteDatabaseConnection,
> {
	protected _cxn: C;
	protected _mutex: AsyncMutex;
	private _mutexLockDepth = 0;
	public readonly schema: S;
	public readonly observer: DBObserver<S>;

	constructor(schema: S, cxn: C) {
		this._cxn = cxn;
		this.schema = schema;
		this._mutex = new AsyncMutex();
		this.observer = new DBObserver<S>();
	}

	/**
	 * Database operations composed of one or more calls to `this._cxn.*` methods should be wrapped in this method.
	 * This ensures that all database operations are executed sequentially, even if not explicitly awaited. This
	 * also ensures that operations which invoke multiple `this._cxn.*` methods do not interleave.
	 *
	 * **Note for subclasses:**
	 *
	 * Most public methods in this class already aquire the mutex lock, so unless your method
	 * directly invokes `this._cxn`, you should not need to call this method.
	 */
	protected async _withMutex<T>(fn: () => Promise<T>): Promise<T> {
		// deadlock prevention mechanism
		if (this._mutexLockDepth > 0) {
			return await fn();
		}

		const release = await this._mutex.lock();

		this._mutexLockDepth++;

		try {
			return await fn();
		} finally {
			this._mutexLockDepth--;

			if (this._mutexLockDepth === 0) {
				release();
			}
		}
	}

	/**
	 * Sets the database connection.
	 */
	async setConnection(cxn: C) {
		this._cxn = cxn;
	}

	/**
	 * Creates the database tables defined in the schema if they don't already exist.
	 * This should be called before performing any other database operations.
	 */
	async createTables() {
		const commands = cmdCreateTables(this.schema);

		await this._withMutex(async () => {
			for (const command of commands) {
				await this._cxn.execute(command.sql, command.parameters as any[]);
			}
		});
	}

	/**
	 * Creates a new query builder for a table.
	 * @param table The name of the table to query
	 * @param builder An optional builder function to set on the query builder
	 * @returns A new query builder instance
	 *
	 * @example
	 * ```ts
	 * const query = db.fromTable("users", ({ where }) => where("name").equals("John"));
	 * ```
	 */
	fromTable<T extends TableName<S>>(table: T, builder?: BuilderFunction<T, S>) {
		if (builder) {
			return new TableQueryBuilder<T, S>(table, this.schema).and(builder);
		}

		return new TableQueryBuilder<T, S>(table, this.schema);
	}

	/**
	 * Executes a query and returns all matching rows.
	 * @param query The query to execute
	 * @returns An array of all matching rows
	 */
	async select<T extends TableName<S>>(
		query: Query<T> | TableQueryBuilder<T, S>,
		opts?: { limit?: number }
	): Promise<Simplify<RowForwardSerialized<T, S>>[]> {
		if (query instanceof TableQueryBuilder && query.suppressed) {
			return [];
		}

		const _query = query instanceof TableQueryBuilder ? query.toQuery() : query;
		const { sql, parameters } = cmdSelect(_query, this.schema, opts?.limit);
		const result = await this._cxn.execute(sql, parameters as any[]);

		return result.map(r =>
			deserializeSpecialColumns(this.schema, query.tableName, r)
		) as RowForwardSerialized<T, S>[];
	}

	/**
	 * Selects rows from a table by their primary keys.
	 * @param table The name of the table to select from
	 * @param primaryKeys The primary key values of the rows to select
	 * @returns An array of rows with the specified primary keys
	 */
	async selectByPrimaryKeys<T extends TableName<S>>(
		table: T,
		primaryKeys: JSTypeOfPrimaryKey<T, S>[]
	): Promise<RowForwardSerialized<T, S>[]> {
		const { sql, parameters } = cmdSelectByPrimaryKeys(table, this.schema, primaryKeys);
		const result = await this._cxn.execute(sql, parameters as any[]);
		return result.map(r =>
			deserializeSpecialColumns(this.schema, table, r)
		) as RowForwardSerialized<T, S>[];
	}

	/**
	 * Resolves foreign keys for a set of rows of a given table.
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
	 *       user: DBForeignKey<"users">;
	 *     };
	 *     primaryKey: "id";
	 *   };
	 * };
	 *
	 * // Comments with just userID numbers
	 * const comments = [
	 *   { id: 1, user: 123 },
	 *   { id: 2, user: 456 }
	 * ];
	 *
	 * // Resolve foreign keys to get full user objects
	 * const resolved = await db.resolveForeignKeys("comments", comments);
	 * // [
	 * //   { id: 1, user: { id: 123, name: "Alice" } },
	 * //   { id: 2, user: { id: 456, name: "Bob" } }
	 * // ]
	 * ```
	 */
	async resolveForeignKeys<T extends TableName<S>>(
		table: T,
		rows: Simplify<RowReverseSerialized<T, S>>[]
	): Promise<RowForwardSerializedFKeysResolved<T, S>[]> {
		const tableSchema = this.schema[table];

		// e.g. ["user"]
		const foreignKeyColumnNames = Object.keys(tableSchema.columns).filter(
			col => "table" in tableSchema.columns[col]
		);

		// e.g. { user: "users" }
		const foreignKeyColumnNamesToTables: Record<string, string> = {};
		for (const col of foreignKeyColumnNames) {
			foreignKeyColumnNamesToTables[col] = (tableSchema.columns[col] as DBForeignKey<string>).table;
		}

		// e.g. { user: [1, 2, 3] }
		const foreignKeyValuesByColumn: Record<string, any[]> = {};
		for (const col of foreignKeyColumnNames) {
			foreignKeyValuesByColumn[col] = [...new Set(rows.map(r => r[col as never]))];
		}

		// e.g. { user: Map{ 1: { id: 1, name: "Alice" }, 2: { id: 2, name: "Bob" }, 3: { id: 3, name: "Charlie" } } }
		const resolvedForeignKeys: Record<string, Map<any, any>> = {};

		await this._withMutex(async () => {
			for (const col of foreignKeyColumnNames) {
				const primaryKeys = foreignKeyValuesByColumn[col];
				const pk = this.schema[foreignKeyColumnNamesToTables[col]].primaryKey;
				const items = await this.selectByPrimaryKeys(
					foreignKeyColumnNamesToTables[col],
					primaryKeys
				);

				resolvedForeignKeys[col] = new Map(items.map(r => [(r as any)[pk], r]));
			}
		});

		// Replace foreign key values with resolved objects
		return rows
			.map(r => {
				const output: Record<string, any> = { ...r };
				for (const col of foreignKeyColumnNames) {
					output[col] = resolvedForeignKeys[col].get(r[col as never]);
					if (output[col] === undefined) {
						return null;
					}
				}
				return output;
			})
			.filter(
				(row): row is NonNullable<typeof row> => row !== null
			) as RowForwardSerializedFKeysResolved<T, S>[];
	}

	/**
	 * Executes a query and returns the first matching row, or null if no rows match.
	 * @param query The query to execute
	 * @returns The first matching row, or null if no rows match
	 */
	async selectOne<T extends TableName<S>>(
		query: Query<T> | TableQueryBuilder<T, S>
	): Promise<Simplify<RowForwardSerialized<T, S>> | null> {
		const result = await this.select(query, { limit: 1 });
		return result[0] ?? null;
	}

	async exists<T extends TableName<S>>(query: Query<T> | TableQueryBuilder<T, S>) {
		const result = await this.select(query, { limit: 1 });
		return result.length > 0;
	}

	/**
	 * Inserts a new row into the specified table.
	 * @param table The name of the table to insert into
	 * @param values The values to insert
	 */
	async insertRow<T extends TableName<S>>(table: T, values: Simplify<RowReverseSerialized<T, S>>) {
		const commands = cmdInsert(table, values, this.schema);

		await this._withMutex(async () => {
			for (const command of commands) {
				await this._cxn.execute(command.sql, command.parameters as any[]);
			}

			this.observer._rowInsert.emit(table, { table, rows: [values] });
		});
	}

	/**
	 * Inserts multiple rows into a table.
	 * @param table The name of the table to insert into
	 * @param rows The rows to insert
	 */
	async insertRows<T extends TableName<S>>(table: T, rows: Simplify<RowReverseSerialized<T, S>>[]) {
		await this._withMutex(async () => {
			// const now = performance.now();
			const batchSize = 1024;

			for (let i = 0; i < rows.length; i += batchSize) {
				const batch = rows.slice(i, i + batchSize);

				const commands = cmdInsertMany(table, batch, this.schema);

				await this._cxn.executeInTransaction(
					commands.map(c => ({
						sql: c.sql,
						parameters: c.parameters as any[],
					}))
				);
			}

			this.observer._rowInsert.emit(table, { table, rows });

			// console.log(
			// 	`Inserted ${rows.length} objects into table ${table} in ${performance.now() - now}ms`
			// );
		});
	}

	/**
	 * Inserts a new row or updates an existing row in the specified table.
	 * The row is identified by its primary key value.
	 * @param table The name of the table to upsert into
	 * @param values The values to upsert
	 */
	async upsertRow<T extends TableName<S>>(table: T, values: Simplify<RowReverseSerialized<T, S>>) {
		await this.upsertRows(table, [values]);
	}

	/**
	 * Inserts multiple rows into a table, updating existing rows if they have the same primary key.
	 * @param table The name of the table to upsert into
	 * @param rows The rows to upsert
	 */
	async upsertRows<T extends TableName<S>>(
		table: T,
		rows: Simplify<RowReverseSerialized<T, S>>[],
		opts?: { batchSize?: number }
	) {
		await this._withMutex(async () => {
			// const now = performance.now();
			const batchSize = opts?.batchSize ?? 1024;

			for (let i = 0; i < rows.length; i += batchSize) {
				const batch = rows.slice(i, i + batchSize);

				const commands = cmdUpsertMany(table, batch, this.schema);

				await this._cxn.executeInTransaction(
					commands.map(c => ({
						sql: c.sql,
						parameters: c.parameters as any[],
					}))
				);

				// console.log(`[upsert] ${i + batch.length} of ${rows.length} rows`);
			}

			// console.log(
			// 	`Upserted ${rows.length} objects into table ${table} in ${performance.now() - now}ms`
			// );

			this.observer._rowInsert.emit(table, { table, rows });
		});
	}

	/**
	 * Updates an existing row in the specified table.
	 * @param table The name of the table to update
	 * @param pk The primary key value of the row to update
	 * @param values The new values to set
	 */
	async updateRow<T extends TableName<S>>(table: T, values: UpdateRowPayload<T, S>) {
		await this._withMutex(async () => {
			await this.updateRows(table, [values]);

			this.observer._rowUpdate.emit(table, { table, rows: [values] });
		});
	}

	/**
	 * Updates multiple rows in the specified table.
	 * @param table The name of the table to update
	 * @param rows The rows to update
	 */
	async updateRows<T extends TableName<S>>(table: T, rows: UpdateRowPayload<T, S>[]) {
		await this._withMutex(async () => {
			const commands = cmdUpdateMany(table, rows, this.schema);

			for (const command of commands) {
				await this._cxn.execute(command.sql, command.parameters as any[]);
			}

			this.observer._rowUpdate.emit(table, { table, rows });
		});
	}

	/**
	 * Deletes rows from a table based on a query.
	 * @param where The query to delete rows by
	 */
	async deleteWhere<T extends TableName<S>>(where: Query<T> | TableQueryBuilder<T, S>) {
		await this._withMutex(async () => {
			const relevantRows = await this.select(where);
			const pks = relevantRows.map(row => (row as any)[this.schema[where.tableName].primaryKey]);
			const batchSize = 1204;
			for (let i = 0; i < pks.length; i += batchSize) {
				const batch = pks.slice(i, i + batchSize);
				await this.deleteRows(where.tableName, batch);
			}

			this.observer._rowDelete.emit(where.tableName, { table: where.tableName, pks });
		});
	}

	/**
	 * Deletes a row from a table.
	 * @param table The name of the table to delete from
	 * @param pk The primary key value of the row to delete
	 */
	async deleteRow<T extends TableName<S>>(table: T, pk: JSTypeOfPrimaryKey<T, S>) {
		await this.deleteRows(table, [pk]);
	}

	/**
	 * Deletes multiple rows from a table.
	 * @param table The name of the table to delete from
	 * @param pks The primary key values of the rows to delete
	 */
	async deleteRows<T extends TableName<S>>(table: T, pks: JSTypeOfPrimaryKey<T, S>[]) {
		const commands = cmdDeleteMany(table, pks, this.schema);

		await this._withMutex(async () => {
			for (const command of commands) {
				await this._cxn.execute(command.sql, command.parameters as any[]);
			}

			this.observer._rowDelete.emit(table, { table, pks });
		});
	}

	/**
	 * Garbage collects orphaned virtual table rows from the database.
	 *
	 * If a table is provided, only the virtual table rows for that table will be garbage collected.
	 * Otherwise, all virtual table rows will be garbage collected.
	 *
	 * @param table - The table to garbage collect, or undefined to garbage collect all tables.
	 */
	async garbageCollect(table?: TableName<S>) {
		let commands;

		if (table) {
			commands = cmdGarbageCollectSingleTable(this.schema, table);
		} else {
			commands = cmdGarbageCollectAllTables(this.schema);
		}

		await this._withMutex(async () => {
			for (const command of commands) {
				await this._cxn.execute(command.sql, command.parameters as any[]);
			}
		});
	}

	/**
	 * Debug function to get basic statistics about the database.
	 */
	async dbStat() {
		return this._withMutex(async () => {
			const output: Record<string, DBTableStat> = {};

			for (const table of Object.keys(this.schema)) {
				const tableStat: DBTableStat = {
					primaryRowCount: 0,
				};

				const cmdStatPrimary = cmdStat(table);
				const cmdStatFTS = cmdStat(getFTS5VirtualTableName(table));
				const cmdStatVector = cmdStat(getVectorVirtualTableName(table));

				const resultPrimary = await this._cxn.execute(
					cmdStatPrimary.sql,
					cmdStatPrimary.parameters as any[]
				);
				tableStat.primaryRowCount = resultPrimary[0].count;

				if (getFullTextColumns(this.schema[table]).length > 0) {
					const result = await this._cxn.execute(cmdStatFTS.sql, cmdStatFTS.parameters as any[]);
					tableStat.ftsRowCount = result[0].count;
				}

				if (getVectorColumns(this.schema[table]).length > 0) {
					const result = await this._cxn.execute(
						cmdStatVector.sql,
						cmdStatVector.parameters as any[]
					);
					tableStat.vectorRowCount = result[0].count;
				}

				output[table] = tableStat;
			}

			return output;
		});
	}

	/**
	 * Returns the underlying database connection.
	 *
	 * **Warning:** This is an unsafe method that bypasses the mutex lock.
	 * Use at your own risk!
	 */
	_unsafeGetConnection() {
		return this._cxn;
	}
}

/**
 * JSON and vector columns do not automatically deserialize, so we need to do it manually.
 */
function deserializeSpecialColumns<S extends DBSchema>(
	schema: S,
	table: keyof S,
	row: Record<string, any>
) {
	const tableSchema = schema[table];
	const output: Record<string, any> = {};

	for (const column of Object.keys(tableSchema.columns)) {
		if (tableSchema.columns[column].type === "stringArray") {
			output[column] = JSON.parse(row[column] as string);
		} else if (tableSchema.columns[column].type === "vector") {
			const distanceColumnName = getVectorDistanceColumnName(column);
			output[distanceColumnName] = row[distanceColumnName] ?? null;

			// below: code to include the embedding as an appropriately typed array.
			// for memory bandwidth reasons, we have decided not to return the embedding for
			// a row in the result set.

			// let typedEmbedding;
			// const rawEmbedding: ArrayBuffer = row[column].buffer;
			// const dtype = tableSchema.columns[column].dtype;

			// if (dtype === "f32") {
			// 	typedEmbedding = new Float32Array(rawEmbedding);
			// } else if (dtype === "i8") {
			// 	typedEmbedding = new Int8Array(rawEmbedding);
			// }

			// output[column] = typedEmbedding;
		} else {
			output[column] = row[column];
		}
	}

	return output;
}

/**
 * A mutex implementation that ensures asynchronous operations are executed sequentially.
 * This prevents race conditions by making concurrent operations wait for their turn.
 */
class AsyncMutex {
	/** The promise chain that tracks pending operations */
	private promise: Promise<void> = Promise.resolve();

	/**
	 * Acquires the mutex lock and returns a function to release it.
	 * Operations will be executed in the order that lock() is called.
	 * @returns A promise that resolves to a release function. Call the release function when done with the critical section.
	 */
	lock(): Promise<() => void> {
		let release: () => void;
		const newPromise = new Promise<void>(resolve => (release = resolve));
		const currentPromise = this.promise;
		this.promise = this.promise.then(() => newPromise);
		return currentPromise.then(() => release!);
	}
}

export interface DBTableStat {
	primaryRowCount: number;
	ftsRowCount?: number;
	vectorRowCount?: number;
}
