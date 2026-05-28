# Quick Start

Install Zog with Zod and the MongoDB driver:

```sh
pnpm add @mp-lb/zog zod mongodb
```

## 1. Define A Model

```ts
import { MongoClient } from "mongodb";
import { z } from "zod";
import { createModel, defineDb, uniqueIndex } from "@mp-lb/zog";

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
```

`createModel` accepts any schema-like object with a synchronous `parse()`
method.

Transformed schemas are supported. Repository reads return the parsed output
type, and `primaryKey` is checked against that parsed output:

```ts
const storeSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
}).transform((record) => ({
  ...record,
  _id: record.id,
}));

const storeModel = createModel("stores", storeSchema, {
  primaryKey: "_id",
});
```

If the logical model name differs from the physical Mongo collection, pass
`collectionName`:

```ts
const storeModel = createModel("stores", storeSchema, {
  collectionName: "store_metadata",
  legacyCollectionNames: ["store-metadata"],
  primaryKey: "_id",
});
```

If `store_metadata` does not exist yet but `store-metadata` does, repository and
index operations use the declared legacy collection. If both names exist, Zog
throws instead of choosing between split data.

For stored documents that still use old key names, declare read-time key
renames:

```ts
const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  legacyKeyRenames: [
    { from: "full_name", to: "name" },
    { from: "profile.display_name", to: "profile.displayName" },
    { from: "teams[].members[].full_name", to: "teams[].members[].name" },
  ],
});
```

`legacyKeyRenames` runs before schema parsing on reads. `[]` applies the rename
to every object in an array. If both the legacy and current keys exist, the
current key wins. Zog removes the legacy key from the parse candidate, but does
not rewrite MongoDB automatically. For custom legacy shapes, use
`normalizeLegacy`.

For legacy index cleanup, use `beforeEnsureIndexes`:

```ts
const fileModel = createModel("files", fileSchema, {
  primaryKey: "id",
  beforeEnsureIndexes: async (collection) => {
    await collection.dropIndex("ownerId_1");
  },
  indexes: [uniqueIndex({ workspaceId: 1, path: 1 })],
});
```

## 2. Create The Database Adapter

```ts
const mongoClient = new MongoClient(process.env.MONGODB_URI!);
await mongoClient.connect();

const db = defineDb([userModel] as const, {
  mongoClient,
  databaseName: "zog_test",
  collectionNamePolicy: "snake",
  collectionNameCompatibility: "error",
});

await db.ensureIndexes();
```

The `as const` is important. It lets TypeScript infer `db.users` from the
literal model name.

`collectionNamePolicy` is optional. When enabled, Zog rejects model collection
names that do not match the policy. `collectionNameCompatibility: "error"` adds
a naming-scheme guard before repository and index operations, so an undeclared
`store-metadata` collection is reported before Zog creates `store_metadata`.

`ensureIndexes()` is additive: it creates declared indexes and leaves existing
indexes alone. To inspect or reconcile indexes, use the diff and sync APIs:

```ts
const diff = await db.diffIndexes();

const dryRun = await db.syncIndexes({ dryRun: true });

await db.syncIndexes();
```

`diffIndexes()` reports matching, missing, changed, and extra indexes for each
model. `syncIndexes()` drops changed indexes, creates missing and changed
declared indexes, and drops undeclared extra indexes by default. Use
`{ dropExtra: false }` to keep extra indexes while still fixing changed declared
indexes.

## 3. Read And Write

```ts
const now = new Date().toISOString();

const user: User = {
  id: "user_1",
  email: "test@example.com",
  name: "Test User",
  createdAt: now,
  updatedAt: now,
};

await db.users.insertOne(user);

const byId = await db.users.findById("user_1");
const byEmail = await db.users.findOne({ email: "test@example.com" });
const page = await db.users.find({}).sort({ email: 1 }).limit(20).toArray();

await db.users.updateOne(
  { id: "user_1" },
  {
    $set: {
      name: "Updated User",
      updatedAt: new Date().toISOString(),
    },
  },
);

await db.users.replaceOne(
  { id: "user_1" },
  {
    ...user,
    name: "Replacement User",
    updatedAt: new Date().toISOString(),
  },
);

await db.users.deleteOne({ id: "user_1" });

// Escape hatch: raw MongoDB collection, no Zog parsing or primary-key mapping.
await db.users.raw.aggregate([]).toArray();
```

Writes store one canonical Mongo primary key, `_id`, mapped from the domain
primary key:

```ts
{
  _id: "user_1",
  email: "test@example.com",
  name: "Test User",
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z"
}
```

Mongo will not generate an accidental ObjectId for records written through
Zog. On reads, Zog maps `_id` back to the configured domain primary key before
parsing through the schema.
