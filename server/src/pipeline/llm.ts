import { CohereClient } from "cohere-ai";
import { env } from "../env";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { zodToTypeString } from "./zutils";

const client = new CohereClient({
    token: env.cohereAPIKey,
});

export async function recommendVideosToRemove(
    negativePreferences: string[],
    videoTitles: string[]
): Promise<string[] | null> {
    const prompt = `
You are to help users filter out unwanted videos based on their preferences. The user has provided the following negative preferences:

${negativePreferences.map((pref, index) => `${index + 1}. ${pref}`).join("\n")}

Here are the titles of videos currently visible to the user:

${videoTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")}

Based on the user's negative preferences, recommend which videos should be removed. Respond with a JSON array of video titles to remove.`;

    const schema = z.array(z.string());

    return jsonStructuredChat(prompt, schema);
}

export async function createPositiveNegativeTrigger(summary: string) {
    const prompt = `You're going to talk to youtube users who are frustrated with their algorithm, and rewrite their preferences in a standard format. A "feed-manipulator" bot will then use your processed preferences to directly affect the users youtube feed. You will only output their negative-preferences, things they want to avoid, not things they want to see more of.

Users have three types of preferences: "triggers", "topics", and "politics". Triggers are types of content that the user doesn't want to see at all, in any context, and need to be immediately removed from the feed. This includes addictions, like gambling, sexual content, or alcohol, and includes mental illness triggers like suicide. Topics are videos that the user finds annoying, like specific youtubers. Politics are videos that express specific sentiments. For example, racist videos and political parties are politics.

When you identify a preference, categorize it and come up with a list of keywords that the feed-manipulator can use to find it on youtube. You can also add the names of specific youtube channels to the list. Do not over generalize the preferences. For example, do not generalize the topic "minecraft" to "videogames", or the topic "Taylor Swift" to "Music", or the topic "transphobia" to "trans people".

Summary: ${summary}.`;

    const schema = z.object({
        triggers: z.array(z.string()),
        topics: z.array(z.string()),
        politics: z.array(z.string()),
    });

    return jsonStructuredChat(prompt, schema);
}

export async function jsonStructuredChat<T extends z.ZodTypeAny>(
    prompt: string,
    schema: T
): Promise<z.infer<T> | null> {
    const response = await client.chat({
        model: env.modelName,
        message:
            prompt +
            "\n\nWrite your response in JSON format. The format should match the following type: " +
            zodToTypeString(schema),
        responseFormat: {
            type: "json_object",
            schema: zodToJsonSchema(schema, "JsonSchema").definitions?.[
                "JsonSchema"
            ],
        },
    });
    console.log(response.text);
    console.log(zodToTypeString(schema));

    if (response.generationId) {
        try {
            return JSON.parse(response.text); // Adjust parsing logic if necessary
        } catch (error) {
            console.error("Failed to parse response:", response.text);
            return null;
        }
    }

    return null;
}
