import { CohereClient } from "cohere-ai";
import { env } from "../env";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const client = new CohereClient({
    token: env.cohereAPIKey,
});

export async function generateText(prompt: string) {
    const response = await client.generate({
        model: env.modelName,
        prompt,
    });

    return response.generations[0].text;
}

export async function generateJSON<T>(prompt: string, schema: z.ZodSchema<T>) {
    const response = await client.chat({
        model: env.modelName,
        message: prompt + "\n\n" + "Please respond with a JSON object",
        responseFormat: {
            type: "json_object",
            schema: zodToJsonSchema(schema, "mySchema").definitions?.[
                "mySchema"
            ],
        },
    });

    console.log(response);
}
