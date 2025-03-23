import sqlite3 from "sqlite3";
import { SQLiteDatabaseConnection } from "./sequin";

/**
 * Caches prepared SQL statements to improve query performance by avoiding repeated parsing.
 */
export class CachedQueryExecutor {
    /** Cache of prepared statements indexed by SQL string */
    cache: Record<string, sqlite3.Statement>;

    constructor(readonly sql: sqlite3.Database) {
        this.cache = {};
    }

    /**
     * Executes a SQL query with parameters, using cached prepared statements.
     * @param sql The SQL query string
     * @param parameters The query parameters
     * @returns An array of result rows as objects
     */
    async execute(
        sql: string,
        parameters: any[]
    ): Promise<Record<string, any>[]> {
        console.log(sql, parameters);
        let stmt = this.cache[sql];

        if (!stmt) {
            stmt = this.sql.prepare(sql);
            this.cache[sql] = stmt;
        }

        if (parameters.length > 0) {
            stmt.reset();
            stmt.bind(...parameters);
        }

        const out = [];

        while (true) {
            const row = await statmentGet(stmt);

            if (!row) break;
            out.push(row);
            // if (columnNames) {
            // 	// mimics the implementation seen in
            // 	// https://github.com/sql-js/sql.js/blob/436a8803985e463986c46de1eb8d04e8c4693200/src/api.js#L486
            // 	const row: Record<string, any> = {};
            // 	for (let i = 0; i < columnNames.length; i++) {
            // 		row[columnNames[i]] = stmt.get(i);
            // 	}
            // 	out.push(row);
            // }
        }

        return out;
    }

    async executeManyInTransaction(
        queries: { sql: string; parameters: any[] }[]
    ) {
        await dbExecute(this.sql, "BEGIN TRANSACTION");
        for (const query of queries) {
            await this.execute(query.sql, query.parameters);
        }
        await dbExecute(this.sql, "COMMIT");
    }

    /**
     * Clears the statement cache and frees all prepared statements.
     * Should be called when the database connection is closed.
     */
    clearCache() {
        for (const stmt of Object.values(this.cache)) {
            stmt.finalize();
        }
        this.cache = {};
    }
}

const db = new sqlite3.Database("db.sqlite3");
const executor = new CachedQueryExecutor(db);

export const dbConnection: SQLiteDatabaseConnection = {
    execute: (sql, parameters) => executor.execute(sql, parameters),
    executeInTransaction: (queries) =>
        executor.executeManyInTransaction(queries),
};

function statmentGet(stmt: sqlite3.Statement) {
    return new Promise((resolve, reject) => {
        stmt.get((err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbExecute(db: sqlite3.Database, sql: string) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
}
