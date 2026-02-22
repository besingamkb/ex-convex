import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role", "createdAt"]),

  teams: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    memberCount: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_plan", ["plan"]),

  projects: defineTable({
    name: v.string(),
    teamId: v.id("teams"),
    description: v.optional(v.string()),
    isArchived: v.boolean(),
    lastActivityAt: v.number(),
  })
    .index("by_team", ["teamId", "isArchived"])
    .index("by_activity", ["lastActivityAt"]),

  tasks: defineTable({
    title: v.string(),
    projectId: v.id("projects"),
    assigneeId: v.optional(v.id("users")),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    dueDate: v.optional(v.number()),
  })
    .index("by_project", ["projectId", "status"])
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status", "priority"]),

  comments: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId", "createdAt"]),

  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_channel", ["channelId", "createdAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["channelId"],
    }),

  channels: defineTable({
    name: v.string(),
    teamId: v.id("teams"),
    isPrivate: v.boolean(),
  })
    .index("by_team", ["teamId"]),
});
