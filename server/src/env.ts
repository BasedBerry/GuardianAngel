import fs from "fs";

export interface ServerEnv {
    cohereAPIKey: string;
    modelName: string;
}

export const env: ServerEnv = JSON.parse(fs.readFileSync("env.json", "utf8"));
