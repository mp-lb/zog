import {
  ObjectId,
  type Db,
  type Document,
  type MongoClient,
  type TransactionOptions,
} from "mongodb";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  createMongoZodCollection,
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

  it("renames legacy keys before parsing reads, including nested arrays", async () => {
    const accountSchema = z.object({
      id: z.string(),
      profile: z.object({
        name: z.string(),
      }),
      teams: z.array(
        z.object({
          members: z.array(
            z.object({
              name: z.string(),
            }),
          ),
        }),
      ),
    });
    const accountModel = createModel("accounts", accountSchema, {
      primaryKey: "id",
      legacyKeyRenames: [
        { from: "profile.full_name", to: "profile.name" },
        { from: "teams[].members[].full_name", to: "teams[].members[].name" },
      ],
    });
    const fake = createFakeMongoClient();
    const legacyDocument = {
      _id: "account_1",
      profile: {
        full_name: "Legacy Account",
      },
      teams: [
        {
          members: [{ full_name: "First Member" }, { name: "Current Member" }],
        },
      ],
    };
    fake.collection("accounts").documents.set("account_1", legacyDocument);
    const db = defineDb([accountModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.accounts.findById("account_1")).resolves.toEqual({
      id: "account_1",
      profile: {
        name: "Legacy Account",
      },
      teams: [
        {
          members: [{ name: "First Member" }, { name: "Current Member" }],
        },
      ],
    });
    expect(legacyDocument).toEqual({
      _id: "account_1",
      profile: {
        full_name: "Legacy Account",
      },
      teams: [
        {
          members: [{ full_name: "First Member" }, { name: "Current Member" }],
        },
      ],
    });
  });

  it("prefers current keys when current and legacy keys are both present", async () => {
    const accountSchema = z.object({
      id: z.string(),
      profile: z.object({
        name: z.string(),
      }),
    });
    const accountModel = createModel("accounts", accountSchema, {
      primaryKey: "id",
      legacyKeyRenames: [{ from: "profile.full_name", to: "profile.name" }],
    });
    const fake = createFakeMongoClient();
    fake.collection("accounts").documents.set("account_1", {
      _id: "account_1",
      profile: {
        full_name: "Legacy Account",
        name: "Current Account",
      },
    });
    const db = defineDb([accountModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.accounts.findById("account_1")).resolves.toEqual({
      id: "account_1",
      profile: {
        name: "Current Account",
      },
    });
  });

  it("wraps invalid legacy key rename paths as storage errors", async () => {
    const accountSchema = z.object({
      id: z.string(),
      members: z.array(
        z.object({
          name: z.string(),
        }),
      ),
    });
    const accountModel = createModel("accounts", accountSchema, {
      primaryKey: "id",
      legacyKeyRenames: [{ from: "members[].full_name", to: "members.name" }],
    });
    const fake = createFakeMongoClient();
    fake.collection("accounts").documents.set("account_1", {
      _id: "account_1",
      members: [{ full_name: "Legacy Member" }],
    });
    const db = defineDb([accountModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.accounts.findById("account_1")).rejects.toMatchObject({
      name: "ZogError",
      operation: "findById",
      cause: expect.objectContaining({
        message:
          'legacy key rename "members[].full_name" -> "members.name" must keep the same parent path',
      }),
    });
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

  it("sets validated fields by id without replacing the whole document", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insert(user);

    await expect(db.users.setById("user_1", { name: " Updated User " })).resolves.toEqual({
      ...user,
      name: "Updated User",
    });
    expect(fake.collection("users").documents.get("user_1")).toMatchObject({
      _id: "user_1",
      name: "Updated User",
    });
    expect(fake.collection("users").lastUpdates).toEqual([
      { $set: { name: "Updated User" } },
    ]);
  });

  it("rejects unsafe setById patches before writing", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insert(user);

    await expect(db.users.setById("user_1", { id: "other" })).rejects.toMatchObject({
      name: "ZogError",
      operation: "update",
    });
    await expect(
      db.users.setById("user_1", { email: "not-an-email" }),
    ).rejects.toMatchObject({
      name: "ZogError",
      operation: "update",
    });
    expect(fake.collection("users").lastUpdates).toEqual([]);
  });

  it("sets timestamps on parsed inserts when configured", async () => {
    const clock = createClock([
      "2026-05-18T01:00:00.000Z",
      "2026-05-18T02:00:00.000Z",
    ]);
    const timestampedModel = createModel("users", userSchema, {
      primaryKey: "id",
      timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt",
        now: clock,
      },
    });
    const fake = createFakeMongoClient();
    const db = defineDb([timestampedModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(
      db.users.insert({
        id: "user_1",
        email: user.email,
        name: user.name,
      }),
    ).resolves.toEqual({
      ...user,
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T01:00:00.000Z",
    });
    await db.users.insertOne({
      id: "user_2",
      email: "second@example.com",
      name: "Second User",
    });

    expect(fake.collection("users").documents.get("user_1")).toMatchObject({
      _id: "user_1",
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T01:00:00.000Z",
    });
    expect(fake.collection("users").documents.get("user_2")).toMatchObject({
      _id: "user_2",
      createdAt: "2026-05-18T02:00:00.000Z",
      updatedAt: "2026-05-18T02:00:00.000Z",
    });
  });

  it("updates updatedAt on parsed update and replacement helpers", async () => {
    const clock = createClock([
      "2026-05-18T01:00:00.000Z",
      "2026-05-18T02:00:00.000Z",
      "2026-05-18T03:00:00.000Z",
    ]);
    const timestampedModel = createModel("users", userSchema, {
      primaryKey: "id",
      timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt",
        now: clock,
      },
    });
    const fake = createFakeMongoClient();
    const db = defineDb([timestampedModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insert(user);
    await db.users.updateOne({ id: "user_1" }, { $set: { name: "Updated User" } });

    expect(fake.collection("users").documents.get("user_1")).toMatchObject({
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T02:00:00.000Z",
      name: "Updated User",
    });

    await expect(
      db.users.updateById("user_1", { name: "Replaced User" }),
    ).resolves.toMatchObject({
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T03:00:00.000Z",
      name: "Replaced User",
    });
    expect(fake.collection("users").documents.get("user_1")).toMatchObject({
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T03:00:00.000Z",
      name: "Replaced User",
    });
  });

  it("advances updatedAt on setById when timestamps are configured", async () => {
    const clock = createClock([
      "2026-05-18T01:00:00.000Z",
      "2026-05-18T02:00:00.000Z",
    ]);
    const timestampedModel = createModel("users", userSchema, {
      primaryKey: "id",
      timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt",
        now: clock,
      },
    });
    const fake = createFakeMongoClient();
    const db = defineDb([timestampedModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.users.insert(user);

    await expect(db.users.setById("user_1", { name: "Updated User" })).resolves.toMatchObject({
      createdAt: "2026-05-18T01:00:00.000Z",
      updatedAt: "2026-05-18T02:00:00.000Z",
      name: "Updated User",
    });
    expect(fake.collection("users").lastUpdates).toEqual([
      {
        $set: {
          name: "Updated User",
          updatedAt: "2026-05-18T02:00:00.000Z",
        },
      },
    ]);
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

  it("diffs declared indexes against collection indexes", async () => {
    const model = createModel("stores", userSchema, {
      primaryKey: "id",
      indexes: [
        uniqueIndex({ email: 1 }, { name: "email_1" }),
        index({ createdAt: -1 }, { name: "createdAt_-1" }),
        index({ email: 1, updatedAt: -1 }),
      ],
    });
    const fake = createFakeMongoClient();
    fake.collection("stores").existingIndexes.push(
      {
        key: { email: 1 },
        name: "email_1",
        unique: true,
        v: 2,
      },
      {
        key: { email: 1, updatedAt: 1 },
        name: "email_1_updatedAt_-1",
      },
      {
        key: { name: 1 },
        name: "legacy_name_1",
      },
    );
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const diff = await db.diffIndexes();

    expect(diff.models).toHaveLength(1);
    expect(diff.models[0]).toMatchObject({
      modelName: "stores",
      collectionName: "stores",
      matching: [{ name: "email_1" }],
      missing: [{ name: "createdAt_-1" }],
      changed: [{ name: "email_1_updatedAt_-1" }],
      extra: [{ name: "legacy_name_1" }],
    });
  });

  it("dry-runs index sync without dropping or creating indexes", async () => {
    const model = createModel("stores", userSchema, {
      primaryKey: "id",
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    fake.collection("stores").existingIndexes.push({
      key: { name: 1 },
      name: "legacy_name_1",
    });
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const diff = await db.syncIndexes({ dryRun: true });

    expect(diff.models[0]).toMatchObject({
      missing: [{ name: "email_1" }],
      extra: [{ name: "legacy_name_1" }],
    });
    expect(fake.collection("stores").createdIndexes).toEqual([]);
    expect(fake.collection("stores").droppedIndexes).toEqual([]);
  });

  it("syncs indexes when the collection does not exist yet", async () => {
    const model = createModel("stores", userSchema, {
      primaryKey: "id",
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    fake.collection("stores").namespaceExists = false;
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const dryRun = await db.syncIndexes({ dryRun: true });

    expect(dryRun.models[0]).toMatchObject({
      missing: [{ name: "email_1" }],
      changed: [],
      extra: [],
    });
    expect(fake.collection("stores").createdIndexes).toEqual([]);

    const synced = await db.syncIndexes();

    expect(synced.models[0]).toMatchObject({
      missing: [{ name: "email_1" }],
      changed: [],
      extra: [],
    });
    expect(fake.collection("stores").createdIndexes).toEqual([
      {
        key: { email: 1 },
        name: "email_1",
      },
    ]);
    expect(fake.collection("stores").namespaceExists).toBe(true);
  });

  it("syncs indexes by dropping changed and extra indexes before creating declared indexes", async () => {
    const model = createModel("stores", userSchema, {
      primaryKey: "id",
      indexes: [
        index({ email: 1 }, { name: "email_1" }),
        index({ createdAt: -1 }, { name: "createdAt_-1" }),
      ],
    });
    const fake = createFakeMongoClient();
    fake.collection("stores").existingIndexes.push(
      {
        key: { email: -1 },
        name: "email_1",
      },
      {
        key: { name: 1 },
        name: "legacy_name_1",
      },
    );
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const diff = await db.syncIndexes();

    expect(diff.models[0]).toMatchObject({
      missing: [{ name: "createdAt_-1" }],
      changed: [{ name: "email_1" }],
      extra: [{ name: "legacy_name_1" }],
    });
    expect(fake.collection("stores").droppedIndexes).toEqual([
      "email_1",
      "legacy_name_1",
    ]);
    expect(fake.collection("stores").createdIndexes).toEqual([
      {
        key: { createdAt: -1 },
        name: "createdAt_-1",
      },
      {
        key: { email: 1 },
        name: "email_1",
      },
    ]);
  });

  it("can leave extra indexes alone while syncing changed declared indexes", async () => {
    const model = createModel("stores", userSchema, {
      primaryKey: "id",
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    fake.collection("stores").existingIndexes.push(
      {
        key: { email: -1 },
        name: "email_1",
      },
      {
        key: { name: 1 },
        name: "legacy_name_1",
      },
    );
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await db.syncIndexes({ dropExtra: false });

    expect(fake.collection("stores").droppedIndexes).toEqual(["email_1"]);
    expect(fake.collection("stores").createdIndexes).toEqual([
      {
        key: { email: 1 },
        name: "email_1",
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

  it("enforces opt-in collection name policies", async () => {
    const snakeModel = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      primaryKey: "id",
    });
    const pascalModel = createModel("stores", userSchema, {
      collectionName: "StoreMetadata",
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();

    expect(() =>
      defineDb([snakeModel] as const, {
        mongoClient: fake.client,
        databaseName: "test",
        collectionNamePolicy: "snake",
      }),
    ).not.toThrow();
    expect(() =>
      defineDb([pascalModel] as const, {
        mongoClient: fake.client,
        databaseName: "test",
        collectionNamePolicy: null,
      }),
    ).not.toThrow();
    expect(() =>
      defineDb([snakeModel] as const, {
        mongoClient: fake.client,
        databaseName: "test",
        collectionNamePolicy: "camel",
      }),
    ).toThrow(/collection name must be camel case/);
    expect(() =>
      defineDb([snakeModel] as const, {
        mongoClient: fake.client,
        databaseName: "test",
        collectionNamePolicy: "pascal",
      }),
    ).toThrow(/collection name must be pascal case/);
  });

  it("enforces collection name policies on standalone repositories", () => {
    const model = createModel("stores", userSchema, {
      collectionName: "StoreMetadata",
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();

    expect(() =>
      createMongoZodCollection(fake.client.db("test"), model, {
        collectionNamePolicy: "snake",
      }),
    ).toThrow(/collection name must be snake case/);
  });

  it("errors on existing compatible collections that only differ by naming scheme", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    fake.collection("store-metadata").documents.set(user.id, {
      ...user,
      _id: user.id,
    });
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
      collectionNamePolicy: "snake",
      collectionNameCompatibility: "error",
    });

    await expect(db.stores.insert(user)).rejects.toMatchObject({
      name: "ZogError",
      operation: "insert",
      details: 'collection name conflicts with existing collection "store-metadata"',
    });
    expect(fake.collection("store_metadata").documents.size).toBe(0);
  });

  it("errors on compatible collection names before index creation", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      primaryKey: "id",
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    fake.collection("store-metadata");
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
      collectionNameCompatibility: "error",
    });
    await expect(db.ensureIndexes()).rejects.toMatchObject({
      name: "ZogError",
      operation: "ensureIndexes",
    });
    expect(fake.collection("store_metadata").createdIndexes).toEqual([]);
  });

  it("uses an existing legacy collection declared by the model", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      legacyCollectionNames: ["store-metadata"],
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    fake.collection("store-metadata").documents.set(user.id, {
      ...user,
      _id: user.id,
    });
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });
    fake.collection("store_metadata").namespaceExists = false;

    await expect(db.stores.findById(user.id)).resolves.toEqual(user);
    await expect(db.stores.find({}).toArray()).resolves.toEqual([user]);

    await db.stores.insert({
      ...user,
      id: "user_2",
      email: "second@example.com",
    });
    expect(fake.collection("store-metadata").documents.has("user_2")).toBe(true);
    expect(fake.collection("store_metadata").documents.size).toBe(0);
  });

  it("uses declared legacy collections for index management", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      legacyCollectionNames: ["store-metadata"],
      primaryKey: "id",
      indexes: [index({ email: 1 }, { name: "email_1" })],
    });
    const fake = createFakeMongoClient();
    fake.collection("store-metadata");
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });
    fake.collection("store_metadata").namespaceExists = false;

    await expect(db.ensureIndexes()).resolves.toBeUndefined();
    expect(fake.collection("store-metadata").createdIndexes).toEqual([
      expect.objectContaining({ name: "email_1" }),
    ]);
    expect(fake.collection("store_metadata").createdIndexes).toEqual([]);
  });

  it("rejects split current and legacy collections", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      legacyCollectionNames: ["store-metadata"],
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    fake.collection("store_metadata").documents.set("current", {
      ...user,
      _id: "current",
      email: "current@example.com",
    });
    fake.collection("store-metadata").documents.set("legacy", {
      ...user,
      _id: "legacy",
      email: "legacy@example.com",
    });
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    await expect(db.stores.findOne({})).rejects.toMatchObject({
      name: "ZogError",
      operation: "findOne",
      details:
        'collection name is split between current collection "store_metadata" and legacy collection "store-metadata"',
    });
  });

  it("resolves the compatibility collection name with at most one listCollections per model", async () => {
    const model = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      legacyCollectionNames: ["store-metadata"],
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    fake.collection("store-metadata").documents.set(user.id, {
      ...user,
      _id: user.id,
    });
    const db = defineDb([model] as const, {
      mongoClient: fake.client,
      databaseName: "test",
      collectionNameCompatibility: "error",
    });
    fake.collection("store_metadata").namespaceExists = false;

    await db.stores.findById(user.id);
    await db.stores.findOne({});
    await db.stores.find({}).toArray();
    await db.stores.insert({
      ...user,
      id: "user_2",
      email: "second@example.com",
    });

    // The collection topology is static at runtime, so resolution must be
    // cached: many operations, at most one listCollections round-trip.
    expect(fake.listCollectionsCallCount).toBeLessThanOrEqual(1);
    // It is also resolved lazily (only on first use), so it must actually run.
    expect(fake.listCollectionsCallCount).toBe(1);
  });

  it("scopes compatibility resolution per model so separate models don't share it", async () => {
    const stores = createModel("stores", userSchema, {
      collectionName: "store_metadata",
      legacyCollectionNames: ["store-metadata"],
      primaryKey: "id",
    });
    const accounts = createModel("accounts", userSchema, {
      collectionName: "account_metadata",
      legacyCollectionNames: ["account-metadata"],
      primaryKey: "id",
    });
    const fake = createFakeMongoClient();
    const db = defineDb([stores, accounts] as const, {
      mongoClient: fake.client,
      databaseName: "test",
      collectionNameCompatibility: "error",
    });

    await db.stores.findOne({});
    await db.accounts.findOne({});
    await db.stores.findOne({});
    await db.accounts.findOne({});

    // One resolution per model, regardless of how many times each is used.
    expect(fake.listCollectionsCallCount).toBe(2);
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

  it("binds repositories to an explicit MongoDB session", async () => {
    const fake = createFakeMongoClient();
    const session = fake.client.startSession();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });

    const tx = db.withSession(session);

    expect(tx.session).toBe(session);
    expectTypeOf(tx.users).toEqualTypeOf(db.users);

    await tx.users.insert(user);
    await tx.users.findById("user_1");
    await tx.users.updateOne({ id: "user_1" }, { $set: { name: "Session User" } });

    expect(fake.collection("users").lastOptions).toEqual([
      { session },
      { session },
      { session },
    ]);
  });

  it("runs callbacks inside explicit transactions and ends the session", async () => {
    const fake = createFakeMongoClient();
    const db = defineDb([userModel] as const, {
      mongoClient: fake.client,
      databaseName: "test",
    });
    const transactionOptions = {
      maxCommitTimeMS: 5000,
    } satisfies TransactionOptions;

    const { transaction } = db;
    const result = await transaction(async (tx) => {
      await tx.users.insert(user);
      return tx.users.findById("user_1");
    }, transactionOptions);

    expect(result).toEqual(user);
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0]?.transactionOptions).toBe(transactionOptions);
    expect(fake.sessions[0]?.ended).toBe(true);
    expect(fake.collection("users").lastOptions).toEqual([
      { session: fake.sessions[0] },
      { session: fake.sessions[0] },
    ]);
  });
});

function createFakeMongoClient() {
  const collections = new Map<string, FakeCollection>();
  const sessions: FakeSession[] = [];
  const listCollectionsCalls = { count: 0 };

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
    listCollections: () => {
      listCollectionsCalls.count += 1;
      return new FakeCursor(
        [...collections.entries()]
          .filter(([, collection]) => collection.namespaceExists)
          .map(([name]) => ({ name })),
      );
    },
  } as unknown as Db;

  const client = {
    db: () => db,
    startSession: () => {
      const session = new FakeSession();
      sessions.push(session);
      return session;
    },
  } as unknown as MongoClient;

  return {
    client,
    collection,
    sessions,
    get listCollectionsCallCount() {
      return listCollectionsCalls.count;
    },
  };
}

function createClock(values: string[]): () => string {
  let index = 0;

  return () => values[index++] ?? values.at(-1) ?? "2026-05-18T00:00:00.000Z";
}

class FakeCollection {
  readonly documents = new Map<string, Document>();
  readonly createdIndexes: Document[] = [];
  readonly droppedIndexes: string[] = [];
  readonly existingIndexes: Document[] = [
    {
      key: { _id: 1 },
      name: "_id_",
      v: 2,
    },
  ];
  readonly lastFilters: Document[] = [];
  readonly lastOptions: Document[] = [];
  readonly lastUpdates: Document[] = [];
  namespaceExists = true;

  async findOne(filter: Document, options?: Document): Promise<Document | null> {
    this.lastFilters.push({ ...filter });
    this.recordOptions(options);
    return this.findMatching(filter)[0] ?? null;
  }

  find(filter: Document, options?: Document) {
    this.lastFilters.push({ ...filter });
    this.recordOptions(options);
    return new FakeCursor(this.findMatching(filter));
  }

  async insertOne(document: Document, options?: Document): Promise<Document> {
    this.recordOptions(options);
    this.documents.set(String(document._id), { ...document });
    return { acknowledged: true, insertedId: document._id };
  }

  async insertMany(documents: Document[], options?: Document): Promise<Document> {
    this.recordOptions(options);
    for (const document of documents) {
      this.documents.set(String(document._id), { ...document });
    }
    return { acknowledged: true, insertedCount: documents.length };
  }

  async replaceOne(filter: Document, document: Document, options?: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.recordOptions(options);
    const id = String(filter._id);
    this.documents.set(id, { ...document });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async updateOne(filter: Document, update: Document, options?: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.lastUpdates.push({ ...update });
    this.recordOptions(options);
    const existing = this.findMatching(filter)[0];
    if (existing) {
      applyFakeUpdate(existing, update);
    }
    return { acknowledged: true, matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0 };
  }

  async updateMany(filter: Document, update: Document, options?: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.lastUpdates.push({ ...update });
    this.recordOptions(options);
    const matches = this.findMatching(filter);
    for (const existing of matches) {
      applyFakeUpdate(existing, update);
    }
    return { acknowledged: true, matchedCount: matches.length, modifiedCount: matches.length };
  }

  async findOneAndUpdate(
    filter: Document,
    update: Document,
    options?: Document,
  ): Promise<Document | null> {
    await this.updateOne(filter, update, options);
    return this.findMatching(filter)[0] ?? null;
  }

  async findOneAndReplace(
    filter: Document,
    document: Document,
    options?: Document,
  ): Promise<Document | null> {
    await this.replaceOne(filter, document, options);
    return this.findMatching(filter)[0] ?? null;
  }

  async findOneAndDelete(filter: Document, options?: Document): Promise<Document | null> {
    const existing = this.findMatching(filter)[0] ?? null;
    await this.deleteOne(filter, options);
    return existing;
  }

  async deleteOne(filter: Document, options?: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.recordOptions(options);
    this.documents.delete(String(filter._id));
    return { acknowledged: true, deletedCount: 1 };
  }

  async deleteMany(filter: Document, options?: Document): Promise<Document> {
    this.lastFilters.push({ ...filter });
    this.recordOptions(options);
    const matches = this.findMatching(filter);
    for (const existing of matches) {
      this.documents.delete(String(existing._id));
    }
    return { acknowledged: true, deletedCount: matches.length };
  }

  async bulkWrite(_operations?: Document[], options?: Document): Promise<Document> {
    this.recordOptions(options);
    return { ok: 1 };
  }

  async createIndexes(indexes: Document[]): Promise<string[]> {
    this.namespaceExists = true;
    this.createdIndexes.push(...indexes);
    for (const index of indexes) {
      const name = String(index.name ?? defaultFakeIndexName(index.key));
      const existingIndex = this.existingIndexes.findIndex(
        (value) => value.name === name,
      );
      const storedIndex = {
        ...index,
        name,
      };

      if (existingIndex >= 0) {
        this.existingIndexes[existingIndex] = storedIndex;
      } else {
        this.existingIndexes.push(storedIndex);
      }
    }
    return indexes.map((value) => String(value.name ?? defaultFakeIndexName(value.key)));
  }

  async dropIndex(name: string): Promise<Document> {
    this.droppedIndexes.push(name);
    const existingIndex = this.existingIndexes.findIndex((value) => value.name === name);
    if (existingIndex >= 0) {
      this.existingIndexes.splice(existingIndex, 1);
    }
    return { ok: 1 };
  }

  listIndexes(): FakeCursor {
    if (!this.namespaceExists) {
      throw Object.assign(new Error("ns does not exist"), {
        code: 26,
        codeName: "NamespaceNotFound",
      });
    }

    return new FakeCursor([...this.existingIndexes]);
  }

  private recordOptions(options: Document | undefined): void {
    if (options !== undefined) {
      this.lastOptions.push(options);
    }
  }

  private findMatching(filter: Document): Document[] {
    return [...this.documents.values()].filter((document) =>
      Object.entries(filter).every(([key, value]) => document[key] === value),
    );
  }
}

class FakeSession {
  ended = false;
  transactionOptions: TransactionOptions | undefined;

  async withTransaction<T>(
    callback: () => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    this.transactionOptions = options;
    return callback();
  }

  async endSession(): Promise<void> {
    this.ended = true;
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

function defaultFakeIndexName(key: unknown): string {
  if (typeof key !== "object" || key === null || Array.isArray(key)) {
    return "";
  }

  return Object.entries(key)
    .map(([field, direction]) => `${field}_${String(direction)}`)
    .join("_");
}
