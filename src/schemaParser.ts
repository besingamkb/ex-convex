export type ParsedSchema = Record<
    string, // table name
    Record<
        string, // field name
        {
            optional: boolean;
            type: string;
        }
    >
>;

/**
 * Extracts table definitions and their `v.optional()` or required validator states.
 */
export function parseConvexSchema(content: string): ParsedSchema {
    const schema: ParsedSchema = {};

    // Strip all comments to make parsing predictable
    const noComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

    // Find all defineTable({ ... }) blocks
    const tableRegex = /([\w_]+)\s*:\s*defineTable\s*\(\s*\{([\s\S]*?)\}\s*\)/g;

    let match;
    while ((match = tableRegex.exec(noComments)) !== null) {
        const tableName = match[1];
        const fieldsBlock = match[2];

        const fieldsSchema: Record<string, { optional: boolean; type: string }> = {};

        // Match individual fields:  fieldName: v.optional(v.string())
        const fieldRegex = /([\w_]+)\s*:\s*v\.([\w_]+)\(([\s\S]*?)\)/g;

        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
            const fieldName = fieldMatch[1];
            const validator = fieldMatch[2]; // e.g. "optional", "string", "number", "id"

            const isOptional = validator === "optional";

            let typeStr = validator;
            if (isOptional) {
                // Try to peek inside v.optional(v.string()) to get the inner type
                const innerMatch = fieldMatch[3].match(/v\.([\w_]+)/);
                if (innerMatch) {
                    typeStr = innerMatch[1];
                }
            }

            fieldsSchema[fieldName] = {
                optional: isOptional,
                type: typeStr
            };
        }

        schema[tableName] = fieldsSchema;
    }

    return schema;
}
