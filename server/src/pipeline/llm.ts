import { CohereClient } from "cohere-ai";
import { env } from "../env";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { zodToTypeString } from "./zutils";

const client = new CohereClient({
    token: env.cohereAPIKey,
});

export async function recommendVideosToRemove(
    triggers: string[],
    topics: string[],
    politics: string[],
    titles: string[]
): Promise<string[] | null> {
    const prompt = `You're a youtube feed-manipulator, removing videos from a users feed based on preferences they've given you. You'll be given three lines of preferences as input: triggers, topics, and politics, and a list of youtube video titles and channels.

Triggers are videos that need to removed regardless of context. They're usually related to addictions or mental illnesses like PTSD and OCD. For example, all "gambling" videos or all "suicide" related videos might need to be removed.

Topics are videos that the user finds annoying or uninteresting. You should remove videos that you think are likely part of the same trend as the listen preference.

Politics videos should not be removed just for discussing a topic. They should only be removed if the video actively aligns with the given keyword. So, if the keyword is "racism", racist videos should be removed. But, videos criticising or opposing racism should not be removed. 

You should use your knowledge of specific youtube channels and popular culture to make decisions. For example, using your knowledge of if youtubers are left wing or right wing. You will usually not be able to work out if a video exactly matches a preference, so you should remove it if there's a fair probability it matches. However, in the case of the "politics" category, you might correctly identify that a video is related to the preference, but be unsure as to if it supports or opposes the view in question. In this case, you should lean on the side of not-removing.

Here are the users triggers:
${triggers.map((trigger) => `- ${trigger}`).join("\n")}

Here are the users topics:
${topics.map((topic) => `- ${topic}`).join("\n")}

Here are the users politics:
${politics.map((politic) => `- ${politic}`).join("\n")}

Here are the titles of videos currently visible to the user:
${titles.map((title) => `- ${title}`).join("\n")}

Respond with the titles of videos that should be removed.`;
    const schema = z.object({
        titles: z.array(z.string()),
    });

    const response = await jsonStructuredChat(prompt, schema);

    if (!response) {
        return null;
    }

    return response.titles;
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

/**
 * Create a structured response from the LLM.
 */
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

    console.log(prompt);

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
