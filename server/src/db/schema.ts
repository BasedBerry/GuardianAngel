import { createSchema, DBType, RowForwardSerialized } from "./sequin";

export const schema = createSchema({
    user: {
        columns: {
            uuid: DBType.string,
            preferences: DBType.string,
            username: DBType.string,
            passwordHash: DBType.string,
        },
        primaryKey: "uuid",
    },
});

export type Schema = typeof schema;
export type User = RowForwardSerialized<"user", Schema>;
