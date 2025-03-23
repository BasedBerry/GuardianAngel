import express from "express";
import { db } from "./db/db";
import { v4 } from "uuid";
import { AuthSessionManager, hashPassword } from "./auth";
import { Request, Response } from "express";
import { User } from "./db/schema";
import cors from "cors";
import { createPositiveNegativeTrigger } from "./pipeline/llm";

(async () => {
    const app = express();
    app.use(express.json());
    app.use(cors());

    await db.createTables();
    const authSessionManager = new AuthSessionManager(db);

    // Authentication middleware
    function withAuth(
        req: Request,
        res: Response,
        then: (userUUID: string) => Promise<void> | void
    ) {
        const sessionId = req.headers.authorization;

        if (!sessionId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const userUUID = authSessionManager.validateSession(sessionId);

        if (!userUUID) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        return then(userUUID);
    }

    function withAuthUser(
        req: Request,
        res: Response,
        then: (user: User) => Promise<void> | void
    ) {
        return withAuth(req, res, async (userUUID) => {
            const user = await db.selectOne(
                db.fromTable("user", (q) => q.where("uuid").equals(userUUID))
            );

            if (!user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            return then(user);
        });
    }

    // SIGNUP
    app.post("/signup", async (req, res) => {
        const username = req.body?.username;
        const password = req.body?.password;

        console.log(username, password, req.body);

        if (!username || !password) {
            res.status(400).json({
                error: "Username and password are required",
            });
            return;
        }

        if (username.length < 3 || password.length < 6) {
            res.status(400).json({
                error: "Username must be at least 3 characters and password must be at least 6 characters",
            });

            return;
        }

        const existingUser = await db.select(
            db.fromTable("user", (q) => q.where("username").equals(username)),
            { limit: 1 }
        );

        if (existingUser.length > 0) {
            res.status(400).json({ error: "Username is already in use" });
            return;
        }

        const uuid = v4();

        await db.upsertRow("user", {
            uuid,
            triggers: [],
            topics: [],
            politics: [],
            username,
            passwordHash: hashPassword(password),
        });

        res.json({
            message: "User created successfully",
            token: authSessionManager.createSession(uuid),
        });
    });

    // LOGIN
    app.post("/login", async (req, res) => {
        const username = req.body?.username;
        const password = req.body?.password;

        if (!username || !password) {
            res.status(400).json({
                error: "Username and password are required",
            });
            return;
        }

        const user = await db.selectOne(
            db.fromTable("user", (q) =>
                q.all(
                    q.where("username").equals(username),
                    q.where("passwordHash").equals(hashPassword(password))
                )
            )
        );

        if (!user) {
            res.status(401).json({ error: "Invalid username or password" });
            return;
        }

        res.json({
            message: "Logged in successfully",
            token: authSessionManager.createSession(user.uuid),
        });
    });

    // IDENTITY
    app.get("/identity", (req, res) => {
        withAuthUser(req, res, (user) => {
            res.json({
                user: {
                    uuid: user.uuid,
                    username: user.username,
                    triggers: user.triggers,
                    topics: user.topics,
                    politics: user.politics,
                },
            });
        });
    });

    // Update Preferences
    app.post("/preferences", (req, res) => {
        withAuth(req, res, async (userUUID) => {
            const prompt = req.body?.prompt;

            if (!prompt) {
                res.status(400).json({
                    error: "Prompt is required",
                });
                return;
            }

            const response = await createPositiveNegativeTrigger(prompt);

            if (!response) {
                res.status(500).json({ error: "Failed to update preferences" });
                return;
            }

            await db.updateRow("user", {
                uuid: userUUID,
                triggers: response.triggers,
                topics: response.topics,
                politics: response.politics,
            });

            res.json({
                message: "Preferences updated successfully",
                triggers: response.triggers,
                topics: response.topics,
                politics: response.politics,
            });
        });
    });

    app.listen(3000, () => {
        console.log("Server is running on port 3000");
    });
})();
