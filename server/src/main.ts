import express from "express";
import { db } from "./db/db";
import { v4 } from "uuid";
import { AuthSessionManager, hashPassword } from "./auth";
import { Request, Response } from "express";
import { User } from "./db/schema";
import cors from "cors";
import fetch from "node-fetch"; // for calling OpenAI

process.env.OPENAI_API_KEY = "";


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
            positivePreferences: "",
            negativePreferences: "",
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
                    positivePreferences: user.positivePreferences,
                    negativePreferences: user.negativePreferences,
                },
            });
        });
    });

    // Update Preferences
    app.post("/preferences", (req, res) => {
      withAuth(req, res, async (userUUID) => {
        const rawPositive = req.body.positivePreferences;
        const rawNegative = req.body.negativePreferences;

        if (!rawPositive && !rawNegative) {
          res.status(400).json({
            error: "Positive or negative preferences are required",
          });
          return;
        }

        try {
          // Build GPT prompt
          const prompt = `
    A user has submitted the following preferences.
    
    Positive preferences (things they like):
    ${rawPositive ?? ""}
    
    Negative preferences (things they dislike):
    ${rawNegative ?? ""}
    
    Please rewrite each list clearly, combining similar concepts, removing redundancy, and formatting concisely.
    Respond in strict JSON format:
    
    {
      "positive": "cleaned and summarized positive preferences",
      "negative": "cleaned and summarized negative preferences"
    }
    `;

          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 300,
            }),
          });

          if (!openaiRes.ok) {
            const err = await openaiRes.text();
            console.error("OpenAI API error:", err);
            res.status(500).json({ error: "OpenAI API call failed" });
            return;
          }

          const json = await openaiRes.json() as {
            choices?: { message?: { content?: string } }[];
          };

          const content = json.choices?.[0]?.message?.content?.trim();

          if (!content) {
            res.status(500).json({ error: "Invalid response from OpenAI" });
            return;
          }

          // 🧼 Clean Markdown-style wrapping if present
          let cleanedContent = content;
          if (cleanedContent.startsWith("```")) {
            cleanedContent = cleanedContent
              .replace(/```(?:json)?\s*/i, "")
              .replace(/```$/, "")
              .trim();
          }

          let parsed: { positive?: string; negative?: string } = {};
          try {
            parsed = JSON.parse(cleanedContent);
          } catch (err) {
            console.error("Failed to parse GPT response:", cleanedContent);
            res.status(500).json({ error: "GPT output was not valid JSON" });
            return;
          }

          await db.updateRow("user", {
            uuid: userUUID,
            positivePreferences: parsed.positive ?? "",
            negativePreferences: parsed.negative ?? "",
          });

          res.json({
            message: "Preferences updated successfully",
            processed: {
              positive: parsed.positive ?? "",
              negative: parsed.negative ?? "",
            },
          });
        } catch (err) {
          console.error("Unexpected error in /preferences:", err);
          res.status(500).json({ error: "Internal server error" });
        }
      });
    });
    app.post("/analyze-title", (req, res) => {
      withAuthUser(req, res, async (user) => {
        const title = req.body?.title;

        if (!title) {
          res.status(400).json({ error: "Missing title" });
          return;
        }

        const prompt = `
    The user dislikes the following topics: ${user.negativePreferences}.
    Is the YouTube video title "${title}" related to any of those topics?
    Reply only with "Yes" or "No".
        `;

        try {
          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 3,
            }),
          });

          if (!openaiRes.ok) {
            const errJson = await openaiRes.json().catch(() => ({}));
            console.error("OpenAI API error:", errJson);
            res.status(500).json({ error: "OpenAI API call failed" });
            return;
          }

          // ⛔️ Unsafe type assertion (as requested)
          const json = await openaiRes.json() as {
            choices?: { message?: { content?: string } }[];
          };

          const message = json.choices?.[0]?.message?.content?.toLowerCase().trim();

          if (!message) {
            console.error("Unexpected OpenAI response format:", json);
            res.status(500).json({ error: "Invalid response from OpenAI" });
            return;
          }

          const isRelevant = message.startsWith("yes");
          res.json({ relevant: isRelevant });

        } catch (err) {
          console.error("Error calling OpenAI:", err);
          res.status(500).json({ error: "Failed to analyze title" });
        }
      });
    });

    app.get("/recommended-channels", (req, res) => {
      withAuthUser(req, res, async (user) => {
        const preferences = user.positivePreferences;

        if (!preferences || preferences.trim() === "") {
          res.status(400).json({ error: "No positive preferences found" });
          return;
        }

        const prompt = `
    The user is interested in the following topics: ${preferences}.
    Based on this, recommend 2 popular YouTube channels that create content about these topics.
    Reply ONLY with a JSON array of channel names like: ["Channel A", "Channel B"].
    Do not include any explanation or extra text.
    `;

        try {
          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 100,
            }),
          });

          if (!openaiRes.ok) {
            const errBody = await openaiRes.text();
            console.error("OpenAI API error:", errBody);
            res.status(500).json({ error: "OpenAI API call failed" });
            return;
          }

          const json = await openaiRes.json() as {
            choices?: { message?: { content?: string } }[];
          };

          const content = json.choices?.[0]?.message?.content?.trim();

          if (!content) {
            console.error("No content in OpenAI response:", json);
            res.status(500).json({ error: "Invalid response from OpenAI" });
            return;
          }

          // 🧼 Clean Markdown-style wrapping (```json ... ```)
          let cleanedContent = content;
          if (cleanedContent.startsWith("```")) {
            cleanedContent = cleanedContent
              .replace(/```(?:json)?\s*/i, "") // remove opening ```
              .replace(/```$/, "")            // remove closing ```
              .trim();
          }

          let channels: string[] = [];
          try {
            channels = JSON.parse(cleanedContent);
          } catch (err) {
            console.error("Failed to parse GPT output:", cleanedContent);
            res.status(500).json({ error: "GPT output was not valid JSON" });
            return;
          }

          if (!Array.isArray(channels)) {
            res.status(500).json({ error: "Invalid format from GPT" });
            return;
          }

          res.json({ channels: channels.slice(0, 2) });

        } catch (err) {
          console.error("Unexpected error in /recommended-channels:", err);
          res.status(500).json({ error: "Internal server error" });
        }
      });
    });

    app.listen(3000, () => {
        console.log("Server is running on port 3000");
    });
})();
