import { db } from "./db";
import { 
  userStats, recordings, users,
  entities, relationsTable,
  type UserStats, type InsertUserStats,
  type Recording, type InsertRecording,
  type Entity, type InsertEntity,
  type Relation, type InsertRelation
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUserStats(userId: string): Promise<UserStats | undefined>;
  createUserStats(stats: InsertUserStats): Promise<UserStats>;
  updateUserStats(userId: string, updates: Partial<UserStats>): Promise<UserStats>;
  getRecordings(userId: string): Promise<Recording[]>;
  getRecording(id: number): Promise<Recording | undefined>;
  createRecording(recording: InsertRecording): Promise<Recording>;
  updateRecording(id: number, updates: Partial<Recording>): Promise<Recording>;
  deleteRecording(id: number): Promise<void>;
  getEntities(recordingId: number): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  getRelations(recordingId: number): Promise<Relation[]>;
  createRelation(relation: InsertRelation): Promise<Relation>;
  clearKG(recordingId: number): Promise<void>;
  getUser(id: string): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUserStats(userId: string): Promise<UserStats | undefined> {
    const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    return stats;
  }

  async createUserStats(stats: InsertUserStats): Promise<UserStats> {
    const [newStats] = await db.insert(userStats).values(stats).returning();
    return newStats;
  }

  async updateUserStats(userId: string, updates: Partial<UserStats>): Promise<UserStats> {
    const [updated] = await db
      .update(userStats)
      .set(updates)
      .where(eq(userStats.userId, userId))
      .returning();
    return updated;
  }

  async getRecordings(userId: string): Promise<Recording[]> {
    return await db
      .select()
      .from(recordings)
      .where(eq(recordings.userId, userId))
      .orderBy(desc(recordings.createdAt));
  }

  async getRecording(id: number): Promise<Recording | undefined> {
    const [recording] = await db.select().from(recordings).where(eq(recordings.id, id));
    return recording;
  }

  async createRecording(recording: InsertRecording): Promise<Recording> {
    const [newRecording] = await db.insert(recordings).values(recording).returning();
    return newRecording;
  }

  async updateRecording(id: number, updates: Partial<Recording>): Promise<Recording> {
    const [updated] = await db
      .update(recordings)
      .set(updates)
      .where(eq(recordings.id, id))
      .returning();
    return updated;
  }

  async deleteRecording(id: number): Promise<void> {
    await db.delete(recordings).where(eq(recordings.id, id));
  }

  async getEntities(recordingId: number): Promise<Entity[]> {
    return await db.select().from(entities).where(eq(entities.recordingId, recordingId));
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [newEntity] = await db.insert(entities).values(entity).returning();
    return newEntity;
  }

  async getRelations(recordingId: number): Promise<Relation[]> {
    return await db.select().from(relationsTable).where(eq(relationsTable.recordingId, recordingId));
  }

  async createRelation(relation: InsertRelation): Promise<Relation> {
    const [newRelation] = await db.insert(relationsTable).values(relation).returning();
    return newRelation;
  }

  async clearKG(recordingId: number): Promise<void> {
    await db.delete(relationsTable).where(eq(relationsTable.recordingId, recordingId));
    await db.delete(entities).where(eq(entities.recordingId, recordingId));
  }

  async getUser(id: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
}

export const storage = new DatabaseStorage();