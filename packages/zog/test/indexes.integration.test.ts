import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel, defineDb, index, uniqueIndex } from "../src/index.js";

const mongodbUri = process.env.ZOG_INTEGRATION_MONGODB_URI;
const describeWithMongo = mongodbUri ? describe : describe.skip;

const schema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

describeWithMongo("index management integration", () => {
  let client: MongoClient;
  let databaseName: string;

  beforeAll(async () => {
    client = new MongoClient(mongodbUri!);
    await client.connect();
    databaseName = `zog_indexes_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
  });

  afterAll(async () => {
    await client.db(databaseName).dropDatabase();
    await client.close();
  });

  it("diffs and syncs real MongoDB indexes", async () => {
    const model = createModel("users", schema, {
      primaryKey: "id",
      indexes: [
        uniqueIndex({ email: 1 }, { name: "users_email_unique" }),
        index({ createdAt: -1 }, { name: "users_createdAt_desc" }),
      ],
    });
    const database = client.db(databaseName);
    const collection = database.collection("users");
    await collection.createIndex({ email: -1 }, { name: "users_email_unique" });
    await collection.createIndex({ name: 1 }, { name: "users_legacy_name" });
    const db = defineDb([model] as const, {
      mongoClient: client,
      databaseName,
    });

    const dryRun = await db.syncIndexes({ dryRun: true });

    expect(dryRun.models[0]).toMatchObject({
      missing: [{ name: "users_createdAt_desc" }],
      changed: [{ name: "users_email_unique" }],
      extra: [{ name: "users_legacy_name" }],
    });
    await expect(collection.indexes()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "users_email_unique", key: { email: -1 } }),
        expect.objectContaining({ name: "users_legacy_name" }),
      ]),
    );

    const synced = await db.syncIndexes();

    expect(synced.models[0]).toMatchObject({
      missing: [{ name: "users_createdAt_desc" }],
      changed: [{ name: "users_email_unique" }],
      extra: [{ name: "users_legacy_name" }],
    });
    await expect(collection.indexes()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "users_email_unique",
          key: { email: 1 },
          unique: true,
        }),
        expect.objectContaining({
          name: "users_createdAt_desc",
          key: { createdAt: -1 },
        }),
      ]),
    );
    await expect(collection.indexExists("users_legacy_name")).resolves.toBe(false);
  });
});
