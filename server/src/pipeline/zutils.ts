import { z } from "zod";

/**
 * Converts a Zod schema to a human-readable type string
 */
export function zodToTypeString(schema: z.ZodTypeAny): string {
    // Handle primitive types
    if (schema instanceof z.ZodString) return "string";
    if (schema instanceof z.ZodNumber) return "number";
    if (schema instanceof z.ZodBoolean) return "boolean";
    if (schema instanceof z.ZodNull) return "null";
    if (schema instanceof z.ZodUndefined) return "undefined";
    if (schema instanceof z.ZodAny) return "any";
    if (schema instanceof z.ZodUnknown) return "unknown";
    if (schema instanceof z.ZodVoid) return "void";
    if (schema instanceof z.ZodNever) return "never";
    if (schema instanceof z.ZodLiteral)
        return JSON.stringify(schema._def.value);

    // Handle arrays
    if (schema instanceof z.ZodArray) {
        const itemType = zodToTypeString(schema._def.type);
        return `${itemType}[]`;
    }

    // Handle objects
    if (schema instanceof z.ZodObject) {
        const shape = schema._def.shape();
        const entries = Object.entries(shape).map(([key, value]) => {
            const isOptional = value instanceof z.ZodOptional;
            const typeValue = isOptional
                ? zodToTypeString(value._def.innerType)
                : zodToTypeString(value as z.ZodTypeAny);
            return `${key}${isOptional ? "?" : ""}: ${typeValue}`;
        });

        return `{ ${entries.join(", ")} }`;
    }

    // Handle unions
    if (schema instanceof z.ZodUnion) {
        const options = schema._def.options.map(zodToTypeString);
        return options.join(" | ");
    }

    // Handle intersections
    if (schema instanceof z.ZodIntersection) {
        return `${zodToTypeString(schema._def.left)} & ${zodToTypeString(
            schema._def.right
        )}`;
    }

    // Handle optional types
    if (schema instanceof z.ZodOptional) {
        return `${zodToTypeString(schema._def.innerType)} | undefined`;
    }

    // Handle nullable types
    if (schema instanceof z.ZodNullable) {
        return `${zodToTypeString(schema._def.innerType)} | null`;
    }

    // Handle records
    if (schema instanceof z.ZodRecord) {
        const keyType = zodToTypeString(schema._def.keyType);
        const valueType = zodToTypeString(schema._def.valueType);
        return `Record<${keyType}, ${valueType}>`;
    }

    // Handle maps
    if (schema instanceof z.ZodMap) {
        const keyType = zodToTypeString(schema._def.keyType);
        const valueType = zodToTypeString(schema._def.valueType);
        return `Map<${keyType}, ${valueType}>`;
    }

    // Handle tuples
    if (schema instanceof z.ZodTuple) {
        const items = schema._def.items.map(zodToTypeString);
        return `[${items.join(", ")}]`;
    }

    // Handle enums
    if (schema instanceof z.ZodEnum) {
        const values = schema._def.values.map((v: any) => JSON.stringify(v));
        return values.join(" | ");
    }

    // Handle default fallback
    return "unknown";
}
