import {
	DBSchema,
	JSTypeOfPrimaryKey,
	RowReverseSerialized,
	TableName,
	UpdateRowPayload,
} from "./types";

export interface DBRowInsertEvent<T extends TableName<S>, S extends DBSchema> {
	table: T;
	rows: RowReverseSerialized<T, S>[];
}

export interface DBRowUpdateEvent<T extends TableName<S>, S extends DBSchema> {
	table: T;
	rows: UpdateRowPayload<T, S>[];
}

export interface DBRowDeleteEvent<T extends TableName<S>, S extends DBSchema> {
	table: T;
	pks: JSTypeOfPrimaryKey<T, S>[];
}

class DBEventCallbackManager<T> {
	cbs: ((event: T) => void)[] = [];

	addCallback(callback: (event: T) => void) {
		this.cbs.push(callback);
	}

	removeCallback(callback: (event: T) => void) {
		this.cbs = this.cbs.filter(cb => cb !== callback);
	}

	emit(event: T) {
		for (const cb of this.cbs) {
			cb(event);
		}
	}
}

class PerTableCallbackManager<E, S extends DBSchema> {
	perTable: Partial<{ [K in TableName<S>]: DBEventCallbackManager<E> }> = {};

	addCallback<K extends TableName<S>>(table: K, callback: (event: E) => void) {
		if (!this.perTable[table]) {
			this.perTable[table] = new DBEventCallbackManager();
		}
		this.perTable[table].addCallback(callback);
	}

	removeCallback<K extends TableName<S>>(table: K, callback: (event: E) => void) {
		if (!this.perTable[table]) {
			return;
		}
		this.perTable[table].removeCallback(callback);
	}

	emit<K extends TableName<S>>(table: K, event: E) {
		if (!this.perTable[table]) {
			return;
		}
		this.perTable[table].emit(event);
	}
}

export class DBObserver<S extends DBSchema> {
	_rowInsert: PerTableCallbackManager<DBRowInsertEvent<TableName<S>, S>, S>;
	_rowUpdate: PerTableCallbackManager<DBRowUpdateEvent<TableName<S>, S>, S>;
	_rowDelete: PerTableCallbackManager<DBRowDeleteEvent<TableName<S>, S>, S>;

	constructor() {
		this._rowInsert = new PerTableCallbackManager();
		this._rowUpdate = new PerTableCallbackManager();
		this._rowDelete = new PerTableCallbackManager();
	}

	/**
	 * Called when a new row is inserted or upserted
	 */
	onRowInsert<T extends TableName<S>>(table: T, rows: RowReverseSerialized<T, S>[]) {
		this._rowInsert.emit(table, { table, rows });
	}

	/**
	 * Called when a row is updated
	 */
	onRowUpdate<T extends TableName<S>>(table: T, rows: UpdateRowPayload<T, S>[]) {
		this._rowUpdate.emit(table, { table, rows });
	}

	/**
	 * Called when a row is deleted
	 */
	onRowDelete<T extends TableName<S>>(table: T, pks: JSTypeOfPrimaryKey<T, S>[]) {
		this._rowDelete.emit(table, { table, pks });
	}
}
