import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Export Auth and Chat models (mandatory for integrations)
export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

// User Settings / Stats extension
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  dyslexiaFont: boolean("dyslexia_font").default(false),
  highContrast: boolean("high_contrast").default(false),
  darkMode: boolean("dark_mode").default(false),
  voiceSpeed: text("voice_speed").default("1.0"),
});

export const insertUserStatsSchema = createInsertSchema(userStats).omit({ id: true });
export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;

// Recordings
export const recordings = pgTable("recordings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  audioUrl: text("audio_url").notNull(), // Object Storage path
  duration: integer("duration").notNull(), // Seconds
  status: text("status").default("pending").notNull(), // pending, processing, completed, failed
  transcript: text("transcript"),
  summary: text("summary"), // HTML or Markdown
  mindMap: jsonb("mind_map"), // JSON structure for nodes/edges
  knowledgeGraph: jsonb("knowledge_graph"), // JSON structure for entities/relations (learner-friendly)
  rawKnowledgeGraph: jsonb("raw_knowledge_graph"), // JSON structure for entities/relations (semantic strict)
  studyGuide: jsonb("study_guide"), // JSON array of Q&A
  wordTimings: jsonb("word_timings"), // [{word, start, end}] from Whisper word-level timestamps
  translations: jsonb("translations").default({}), // Map of language codes to translated transcripts
  groupId: integer("group_id").references(() => groups.id, { onDelete: "set null" }),
  notes: jsonb("notes").default({ content: "", pinned: false }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Groups for organizing recordings
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  color: text("color").default("#3b82f6"), // Default blue
  icon: text("icon").default("Folder"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true, userId: true });
export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export const insertRecordingSchema = createInsertSchema(recordings).omit({ 
  id: true, 
  createdAt: true,
  status: true,
  transcript: true,
  summary: true,
  mindMap: true,
  knowledgeGraph: true,
  studyGuide: true,
  translations: true,
  groupId: true,
  userId: true,
  notes: true
});

export type Recording = typeof recordings.$inferSelect;
export type InsertRecording = z.infer<typeof insertRecordingSchema>;

// Knowledge Graph tables
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  recordingId: integer("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  type: text("type").notNull(), // concept, person, object, etc.
  description: text("description"),
  properties: jsonb("properties").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const relationsTable = pgTable("relations", {
  id: serial("id").primaryKey(),
  recordingId: integer("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  sourceId: integer("source_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  strength: numeric("strength", { precision: 3, scale: 2 }).default("1"),
  properties: jsonb("properties").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({ id: true, createdAt: true });
export const insertRelationSchema = createInsertSchema(relationsTable).omit({ id: true, createdAt: true });

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = typeof entities.$inferInsert;
export type Relation = typeof relationsTable.$inferSelect;
export type InsertRelation = typeof relationsTable.$inferInsert;

// --- RELATIONS (Must be defined at the end after all tables are declared) ---

export const userStatsRelations = relations(userStats, ({ one, many }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export const recordingsRelations = relations(recordings, ({ one, many }) => ({
  user: one(users, {
    fields: [recordings.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [recordings.groupId],
    references: [groups.id],
  }),
  entities: many(entities),
  relations: many(relationsTable),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  user: one(users, {
    fields: [groups.userId],
    references: [users.id],
  }),
  recordings: many(recordings),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  recording: one(recordings, {
    fields: [entities.recordingId],
    references: [recordings.id],
  }),
  sourceRelations: many(relationsTable, { relationName: "source" }),
  targetRelations: many(relationsTable, { relationName: "target" }),
}));

export const relationsRelations = relations(relationsTable, ({ one }) => ({
  recording: one(recordings, {
    fields: [relationsTable.recordingId],
    references: [recordings.id],
  }),
  source: one(entities, {
    fields: [relationsTable.sourceId],
    references: [entities.id],
    relationName: "source",
  }),
  target: one(entities, {
    fields: [relationsTable.targetId],
    references: [entities.id],
    relationName: "target",
  }),
}));
