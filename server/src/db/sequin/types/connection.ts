/**
 * Interface for a SQLite database connection that can execute queries and be closed.
 */
export interface SQLiteDatabaseConnection {
	/**
	 * Executes a SQL statement with parameters and returns the results
	 * @param sql The SQL statement to execute
	 * @param params The parameters to bind to the statement
	 * @returns Promise resolving to an array of result rows as objects
	 */
	execute(sql: string, params: any[]): Promise<Record<string, any>[]>;

	/**
	 * Executes a batch of SQL statements in a transaction
	 * @param queries The queries to execute
	 * @returns Promise resolving to an array of result rows as objects
	 */
	executeInTransaction(queries: { sql: string; parameters: any[] }[]): Promise<void>;
}
