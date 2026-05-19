import { ObjectId, type Db, type Document, type MongoClient } from "mongodb";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  createModel,
  defineDb,
  fromMongo,
  index,
  uniqueIndex,
  ZogError,
} from "../src/index.js";

const userSchema = z.object({
  id: z.string().trim().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

type User = z.infer<typeof userSchema>;

const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  indexes: [uniqueIndex({ email: 1 }, { name: "users_email_unique" })],
});

const user: User = {
  id: "user_1",
  email: "test@example.com",
  name: "Test User",
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z",
};

describe("Zog repository", () => {
  it("stores the domain primary key only as canonical Mongo _id", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const inserted = await db.users.insert({
      ...user,
      staleLegacyKey: true,
    } as User);

    expect(inserted).toEqual(user);
    expect(fake.collection("users").documents.get("user_1")).toEqual({
      _id: "user_1",
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });

  it("finds primary keys through _id and parses reads through Zod", async () => {
    const fake = createFakeMongoClient();
    fake.collection("users").documents.set("user_1", {
      ...user,
      _id: "user_1",
      staleLegacyKey: true,
    });

    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.users.findById("user_1")).resolves.toEqual(user);
    await expect(db.users.findOne({ email: user.email })).resolves.toEqual(user);
    await expect(db.users.findOne({ id: "user_1" })).resolves.toEqual(user);
  });

  it("wraps find cursors while preserving Mongo cursor chaining", async () => {
    const fake = createFakeMongoClient();
    fake.collection("users").documents.set("user_2", {
      _id: "user_2",
      email: "second@example.com",
      name: "Second User",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    fake.collection("users").documents.set("user_1", {
      _id: "user_1",
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const users = await db.users.find({}).sort({ email: 1 }).limit(1).toArray();

    expect(users).toEqual([
      {
        id: "user_2",
        email: "second@example.com",
        name: "Second User",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    ]);
    expectTypeOf(users).toMatchTypeOf<User[]>();
  });

  it("copies _id to id for legacy documents when id is missing", () => {
    const candidate = fromMongo(
      {
        modelName: "users",
        collectionName: "users",
        primaryKey: "id",
        schema: userSchema,
        normalizeLegacy: undefined,
        objectIdPolicy: "reject",
      },
      {
        _id: "user_1",
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    );

    expect(userSchema.parse(candidate)).toEqual(user);
  });

  it("throws a storage error when stored data cannot parse", async () => {
    const fake = createFakeMongoClient();
    fake.collection("users").documents.set("user_1", {
      ...user,
      _id: "user_1",
      email: "not-an-email",
    });

    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.users.findById("user_1")).rejects.toMatchObject({
      name: "ZogError",
      modelName: "users",
      collectionName: "users",
      operation: "findById",
    });
  });

  it("rejects ObjectId primary keys by default", async () => {
    const fake = createFakeMongoClient();
    fake.collection("users").documents.set("legacy", {
      ...user,
      id: undefined,
      _id: new ObjectId("000000000000000000000001"),
    });

    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.users.findOne({ email: user.email })).rejects.toBeInstanceOf(
      ZogError,
    );
  });

  it("can stringify ObjectId primary keys when configured", async () => {
    const objectIdModel = createModel("users", userSchema, {
      primaryKey: "id",
      objectIdPolicy: "stringify",
    });
    const objectId = new ObjectId("000000000000000000000001");

    const candidate = fromMongo(
      {
        modelName: "users",
        collectionName: "users",
        primaryKey: "id",
        schema: userSchema,
        normalizeLegacy: undefined,
        objectIdPolicy: objectIdModel.objectIdPolicy,
      },
      {
        ...user,
        id: undefined,
        _id: objectId,
      },
    );

    expect(candidate?.id).toBe(objectId.toHexString());
  });

  it("replaces full documents on updateById and keeps the primary key stable", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insert(user);
    await expect(db.users.updateById("user_1", { id: "other" })).rejects.toMatchObject({
      operation: "updateById",
    });

    await expect(db.users.updateById("user_1", { name: "Updated User" })).resolves.toEqual({
      ...user,
      name: "Updated User",
    });
    expect(fake.collection("users").documents.get("user_1")?.name).toBe("Updated User");
  });

  it("uses Mongo-shaped write methods with primary-key filter mapping", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insertOne(user);
    await db.users.updateOne(
      { id: "user_1" },
      { $set: { name: "Updated User" } },
    );
    await db.users.replaceOne(
      { id: "user_1" },
      { ...user, name: "Replaced User" },
      { upsert: true },
    );

    expect(fake.collection("users").lastFilters).toEqual([
      { _id: "user_1" },
      { _id: "user_1" },
    ]);
    expect(fake.collection("users").documents.get("user_1")).toMatchObject({
      _id: "user_1",
      name: "Replaced User",
    });
    expect(fake.collection("users").documents.get("user_1")).not.toHaveProperty("id");
  });

  it("prevents update operators from changing primary keys", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(
      db.users.updateOne({ id: "user_1" }, { $set: { id: "other" } }),
    ).rejects.toMatchObject({
      name: "ZogError",
    });
    await expect(
      db.users.updateOne({ id: "user_1" }, { $set: { _id: "other" } }),
    ).rejects.toMatchObject({
      name: "ZogError",
    });
  });

  it("exposes the raw collection escape hatch", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.raw.insertOne({ _id: "raw", raw: true } as Document);

    expect(fake.collection("users").documents.get("raw")).toEqual({
      _id: "raw",
      raw: true,
    });
  });

  it("creates declared indexes", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.ensureIndexes();

    expect(fake.collection("users").createdIndexes).toEqual([
      {
        key: { email: 1 },
        name: "users_email_unique",
        unique: true,
      },
    ]);
  });

  it("preserves literal model names in defineDb", () => {
    const storeSchema = z.object({
      id: z.string(),
      slug: z.string(),
      workspaceId: z.string(),
    });
    const storeModel = createModel("stores", storeSchema, {
      primaryKey: "id",
      indexes: [index({ workspaceId: 1, slug: 1 })],
    });
    const fake = createFakeMongoClient();
    const db = defineDb([userModel, storeModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    expectTypeOf(db.users).toHaveProperty("findById");
    type Store = z.infer<typeof storeSchema>;
    expectTypeOf(db.stores.insert).parameter(0).toMatchTypeOf({} as Store);
  });

  it("accepts transformed schemas and constrains primaryKey to parsed output", async () => {
    const storeSchema = z
      .object({
        id: z.string(),
        workspaceId: z.string(),
        slug: z.string(),
      })
      .transform((record) => ({
        ...record,
        _id: record.id,
        normalized: true,
      }));
    const storeModel = createModel("stores", storeSchema, {
      primaryKey: "_id",
    });
    const fake = createFakeMongoClient();
    const db = defineDb([storeModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const inserted = await db.stores.insert({
      id: "store_1",
      workspaceId: "workspace_1",
      slug: "main",
    });

    expect(inserted.normalized).toBe(true);
    expect(inserted.workspaceId).toBe("workspace_1");
    expect(fake.collection("stores").documents.get("store_1")).toMatchObject({
      _id: "store_1",
      id: "store_1",
      normalized: true,
    });
    const parsedStoreCheck: Promise<{
      id: string;
      workspaceId: string;
      slug: string;
      _id: string;
      normalized: boolean;
    } | null> = db.stores.findById("store_1");
    expect(parsedStoreCheck).toBeInstanceOf(Promise);
  });

  it("supports logical model names with physical collection overrides", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.stores.insert(user);

    expect(fake.collection("stores").documents.size).toBe(0);
    expect(fake.collection("store_metadata").documents.get(user.id)).toMatchObject({
      _id: user.id,
    });
    expect(fake.collection("store_metadata").documents.get(user.id)).not.toHaveProperty(
      "id",
    );
  });

  it("runs beforeEnsureIndexes before creating configured indexes", async () => {
    const events: string[] = [];
    const model = createModel("users", userSchema, {
      primaryKey: "id",
      beforeEnsureIndexes: async (collection) => {
        events.push("before");
        await collection.dropIndex("legacy_ownerId_1");
      },
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.ensureIndexes();

    expect(events).toEqual(["before"]);
    expect(fake.collection("users").droppedIndexes).toEqual(["legacy_ownerId_1"]);
    expect(fake.collection("users").createdIndexes).toEqual([
      {
        key: { email: 1 },
        name: "email_1",
      },
    ]);
  });
});

function createFakeMongoClient() {
  const collections = new Map<string, FakeCollection>();

  function collection(name: string): FakeCollection {
    const existing = collections.get(name);
    if (existing) {
      return existing;
    }

    const created = new FakeCollection();
    collections.set(name, created);
    return created;
  }

  const db = {
    collection,
  } as unknown as Db;

  const client = {
    db: () => db,
  } as unknown as MongoClient;

  return { client, collection };
}

class FakeCollection {
  readonly documents = new Map<string, Document>();
  readonly createdIndexes: Document[] = [];
  readonly droppedIndexes: string[] = [];
  readonly lastFilters: Document[] = [];

  async findOne(filter: Document): Promise<Document | null> {
    this.lastFilters.push({ ...filter });
    return this.findMatching(filter)[0] ?? null;
  }

  find(filter: Document) {
    this.lastFilters.push({ ...filter });
    return new FakeCursor(this.findMatching(filter));
  }

  async insertOne(document: Document): Promise<Document> {
    this.documents.set(String(document._id), { ...document });
    return { acknowledged: true, insertedId: document._id };
  }

  async insertMany(documents: Document[]): Promise<Document> {
    for (const document of documents) {
      this.documents.set(String(document._id), { ...document });
    }
    return { acknowledged: true, insertedCount: documents.length };
  }

  async replaceOne(filter: Document, document: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    const id = String(filter._id);
    this.documents.set(id, { ...document });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async updateOne(filter: Document, update: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    const existing = this.findMatching(filter)[0];
    if (existing) {
      applyFakeUpdate(existing, update);
    }
    return { acknowledged: true, matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0 };
  }

  async updateMany(filter: Document, update: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    const matches = this.findMatching(filter);
    for (const existing of matches) {
      applyFakeUpdate(existing, update);
    }
    return { acknowledged: true, matchedCount: matches.length, modifiedCount: matches.length };
  }

  async findOneAndUpdate(filter: Document, update: Document): Promise<Document | null> {
    await this.updateOne(filter, update);
    return this.findMatching(filter)[0] ?? null;
  }

  async findOneAndReplace(filter: Document, document: Document): Promise<Document | null> {
    await this.replaceOne(filter, document);
    return this.findMatching(filter)[0] ?? null;
  }

  async findOneAndDelete(filter: Document): Promise<Document | null> {
    const existing = this.findMatching(filter)[0] ?? null;
    await this.deleteOne(filter);
    return existing;
  }

  async deleteOne(filter: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.documents.delete(String(filter._id));
    return { acknowledged: true, deletedCount: 1 };
  }

  async deleteMany(filter: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    const matches = this.findMatching(filter);
    for (const existing of matches) {
      this.documents.delete(String(existing._id));
    }
    return { acknowledged: true, deletedCount: matches.length };
  }

  async bulkWrite(): Promise<Document> {
    return { ok: 1 };
  }

  async createIndexes(indexes: Document[]): Promise<string[]> {
    this.createdIndexes.push(...indexes);
    return indexes.map((value, index) => String(value.name ?? index));
  }

  async dropIndex(name: string): Promise<Document> {
    this.droppedIndexes.push(name);
    return { ok: 1 };
  }

  private findMatching(filter: Document): Document[] {
    return [...this.documents.values()].filter((document) =>
      Object.entries(filter).every(([key, value]) => document[key] === value),
    );
  }
}

class FakeCursor {
  private index = 0;

  constructor(private documents: Document[]) {}

  async toArray(): Promise<Document[]> {
    return this.documents;
  }

  async next(): Promise<Document | null> {
    return this.documents[this.index++] ?? null;
  }

  async tryNext(): Promise<Document | null> {
    return this.next();
  }

  sort(sort: Document | string): this {
    if (typeof sort === "string") {
      return this;
    }

    const firstEntry = Object.entries(sort)[0];
    if (!firstEntry) {
      return this;
    }
    const [key, direction] = firstEntry;
    if (key) {
      this.documents.sort((left, right) => {
        const result = String(left[key]).localeCompare(String(right[key]));
        return direction === -1 ? -result : result;
      });
    }
    return this;
  }

  limit(value: number): this {
    this.documents = this.documents.slice(0, value);
    return this;
  }

  skip(value: number): this {
    this.documents = this.documents.slice(value);
    return this;
  }

  project(): this {
    return this;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Document, void, void> {
    for (const document of this.documents) {
      yield document;
    }
  }
}

function applyFakeUpdate(document: Document, update: Document): void {
  const set = update.$set;
  if (set && typeof set === "object" && !Array.isArray(set)) {
    Object.assign(document, set);
  }
}
