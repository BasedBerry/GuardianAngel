// import express from "express";

// const app = express();
// const port = 3000;

// app.get("/ping", (req, res) => {
//     res.json({ message: "pong" });
// });

// app.listen(port, () => {
//     console.log(`Server running at http://localhost:${port}`);
// });

import { db } from "./db/db";

db.createTables();
db.upsertRow("user", {
    uuid: "123",
    preferences: "blah",
    username: "test",
    passwordHash: "test",
});
