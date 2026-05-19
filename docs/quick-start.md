# Quick Start

This guide is for trying Zog from another local project before publishing it
to npm.

## 1. Build or Watch Zog

From this repository:

```sh
pnpm install
pnpm dev
```

`pnpm dev` keeps `dist/` updated while you edit the library. Leave it
running in one terminal.

For a one-time build instead:

```sh
pnpm build
```

## 2. Link It Locally

From this repository:

```sh
pnpm link --global
```

From the project where you want to test Zog:

```sh
pnpm link --global @mp-lb/zog
```

That project also needs Zod and the MongoDB driver installed:

```sh
pnpm add zod mongodb
```

If you prefer not to use global links, install the local folder directly
from the test project:

```sh
pnpm add /Users/felixsebastian/Code/zog
```

When using direct local install, run `pnpm build` in this repository again
after library changes.

For an editable local dependency without the global link step, use the `link:`
protocol from the test project:

```sh
pnpm add @mp-lb/zog@link:/Users/felixsebastian/Code/zog
```

With either `pnpm link --global` or `link:`, keep `pnpm dev` running in this
repository so the test project sees fresh `dist/` output.

## 3. Define A Model

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
method. It does not require Zog and the consuming project to resolve the same
physical Zod package, which keeps local `pnpm link` and `link:` workflows from
breaking schema types.

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
  primaryKey: "_id",
});
```

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

## 4. Create The Database Adapter

```ts
const mongoClient = new MongoClient(process.env.MONGODB_URI!);
await mongoClient.connect();

const db = defineDb([userModel] as const, {
  mongoClient,
  databaseName: "zog_test",
});

await db.ensureIndexes();
```

The `as const` is important. It lets TypeScript infer `db.users` from the
literal model name.

## 5. Read And Write

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

## 6. Unlink When Done

From the test project:

```sh
pnpm remove @mp-lb/zog
```

From this repository:

```sh
pnpm unlink --global
```
