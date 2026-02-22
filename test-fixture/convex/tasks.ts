import { query } from "./_generated/server";
import { v } from "convex/values";

// Good: uses index
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Bad: full table scan with collect
export const listAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

// Medium: uses index but no range constraint
export const listByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status")
      .filter((q) => q.eq(q.field("status"), args.status))
      .collect();
  },
});

// Bad: references non-existent index
export const listByDueDate = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_due_date")
      .collect();
  },
});
