import { CohereClient } from "cohere-ai";
import { env } from "../env";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const client = new CohereClient({
    token: env.cohereAPIKey,
});

export async function recommendVideosToRemove(
    negativePreferences: string[],
    videoTitles: string[]
): Promise<string[]> {
    const prompt = `
You are to help users filter out unwanted videos based on their preferences. The user has provided the following negative preferences:

${negativePreferences.map((pref, index) => `${index + 1}. ${pref}`).join("\n")}

Here are the titles of videos currently visible to the user:

${videoTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")}

Based on the user's negative preferences, recommend which videos should be removed. Respond with a JSON array of video titles to remove.
`;

    const schema = z.array(z.string());

    const response = await client.chat({
        model: env.modelName,
        message: prompt,
        responseFormat: {
            type: "json_object",
            schema: zodToJsonSchema(schema, "VideoRemovalSchema").definitions?.["VideoRemovalSchema"],
        },
    });

    if (response.generationId) {
        try {
            return JSON.parse(response.generationId); // Adjust parsing logic if necessary
        } catch (error) {
            console.error("Failed to parse response:", error);
            return [];
        }
    }

    return [];
}