import { parseConvexSchema } from "./src/schemaParser";
import * as fs from "fs";

const schemaPreview = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    availabilityRate: v.optional(v.float64()),
    createdAt: v.float64(),
    displayName: v.string(),
    email: v.string(),
    firstName: v.string(),
    hourlyRate: v.optional(v.float64()),
    lastName: v.string(),
    organizationId: v.optional(v.id("organizations")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("manager"), v.literal("user")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    updatedAt: v.float64(),
  }),
});
`;

console.log(JSON.stringify(parseConvexSchema(schemaPreview), null, 2));
