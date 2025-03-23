import { createSchema, DBType, RowForwardSerialized } from "./sequin";

export const schema = createSchema({
    user: {
        columns: {
            uuid: DBType.string,
            triggers: DBType.stringArray,
            topics: DBType.stringArray,
            politics: DBType.stringArray,
            username: DBType.string,
            passwordHash: DBType.string,
        },
        primaryKey: "uuid" as const,
    },
});

export type Schema = typeof schema;
export type User = RowForwardSerialized<"user", Schema>;
