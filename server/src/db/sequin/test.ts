// import { createSchema, Database, DBType } from "./orm";
// import { createDriver } from "./sqlite/driver";

// const schema = createSchema({
// 	post: {
// 		columns: {
// 			id: DBType.number,
// 			title: DBType.string,
// 			author: DBType.foreignKey("user"),
// 			content: DBType.fullTextString,
// 			tags: DBType.array,
// 		},
// 		primaryKey: "id" as const,
// 	},
// 	user: {
// 		columns: {
// 			id: DBType.number,
// 			name: DBType.string,
// 			email: DBType.string,
// 		},
// 		primaryKey: "id" as const,
// 	},
// });

// export async function main() {
// 	const driver = await createDriver(schema);

// 	const db = new Database(driver);

// 	db.insertRow("user", { id: 1, name: "John", email: "john@example.com" });
// 	db.insertRow("user", { id: 2, name: "Jane", email: "jane@example.com" });
// 	db.insertRow("post", {
// 		id: 1,
// 		title: "Goodbye",
// 		author: 1,
// 		content: "ipsum dolor sit amet",
// 		tags: ["lorem", "ipsum", "dolor", "sit", "amet"],
// 	});
// 	db.insertRow("post", {
// 		id: 2,
// 		title: "Hello",
// 		author: 1,
// 		content: "The quick brown fox",
// 		tags: ["the", "quick", "brown", "fox", "ipsum"],
// 	});
// 	db.insertRow("post", {
// 		id: 3,
// 		title: "Hello",
// 		author: 2,
// 		content: "The quick brown fox",
// 		tags: ["the", "quick", "lorem", "fox"],
// 	});

// 	console.log(db.select(db.queryFrom("post")));

// 	db.bulkUpsertRows("post", [
// 		{
// 			id: 1,
// 			title: "Goodbye 2",
// 			author: 1,
// 			content: "ipsum dolor sit amet",
// 			tags: ["lorem", "ipsum", "dolor", "sit", "amet"],
// 		},
// 		{
// 			id: 2,
// 			title: "Hello 2",
// 			author: 1,
// 			content: "The quick brown fox",
// 			tags: ["the", "quick", "brown", "fox", "ipsum"],
// 		},
// 		{
// 			id: 3,
// 			title: "Hello 3",
// 			author: 2,
// 			content: "The quick brown fox",
// 			tags: ["the", "quick", "lorem", "fox"],
// 		},
// 	]);

// 	console.log(db.select(db.queryFrom("post")));
// }
