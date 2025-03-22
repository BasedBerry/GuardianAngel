import crypto from "crypto";
import { Database, SQLiteDatabaseConnection } from "./db/sequin";
import { Schema, User } from "./db/schema";
import { Response } from "express";
const PASSWORD_SALT = "pee pee poo poo";

export function hashPassword(password: string) {
    return crypto
        .createHash("sha256")
        .update(password + PASSWORD_SALT)
        .digest("hex");
}

export function verifyPassword(password: string, hash: string) {
    return hashPassword(password) === hash;
}

export class AuthSessionManager {
    sessions: Record<string, string> = {};

    constructor(readonly db: Database<Schema>) {}

    async getUserFromSession(sessionId: string): Promise<User | null> {
        const userUUID = this.sessions[sessionId];

        if (!userUUID) {
            return null;
        }

        const user = await this.db.selectOne(
            this.db.fromTable("user", (q) => q.where("uuid").equals(userUUID))
        );

        return user;
    }

    validateSession(sessionId: string): string | null {
        const userUUID = this.sessions[sessionId];

        if (!userUUID) {
            return null;
        }

        return userUUID;
    }

    createSession(userUUID: string) {
        const sessionId = crypto.randomBytes(32).toString("hex");
        this.sessions[sessionId] = userUUID;
        return sessionId;
    }

    logout(sessionId: string) {
        delete this.sessions[sessionId];
    }
}
