# Zog

A tiny Zod-first persistence layer for MongoDB.

Zog keeps application models in terms of `id`, stores that key canonically as
Mongo `_id`, and parses every read and write through Zod at the storage
boundary. The repository API stays close to the MongoDB driver and exposes
`raw` for operations that should bypass Zog.

## Install

```sh
pnpm add @mp-lb/zog zod mongodb
```

`zod` (v3 or v4) and `mongodb` (v6) are peer dependencies.

## Quick example

```ts
import { MongoClient } from "mongodb";
import { z } from "zod";
import { createModel, defineDb } from "@mp-lb/zog";

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
});

const userModel = createModel("users", userSchema, { primaryKey: "id" });

const mongoClient = new MongoClient(process.env.MONGODB_URI!);
await mongoClient.connect();

// `as const` lets TypeScript infer `db.users` from the literal model name.
const db = defineDb([userModel] as const, {
  mongoClient,
  databaseName: "app",
});

await db.users.insertOne({ id: "user_1", email: "a@example.com" });
const user = await db.users.findById("user_1"); // parsed through Zod, typed as User
```

Reads and writes are validated through the schema, and `db.users.raw` is the
unwrapped MongoDB collection for when you need the driver directly.

## Documentation

Guides live in the repository:

- [Quick start](https://github.com/mp-lb/zog/blob/main/packages/zog/docs/quick-start.md) — model and repository basics.
- [Schema evolution](https://github.com/mp-lb/zog/blob/main/packages/zog/docs/schema-evolution.md) — legacy collection names, key renames, normalization.
- [Indexes](https://github.com/mp-lb/zog/blob/main/packages/zog/docs/indexes.md) — declaring, diffing, and syncing indexes.
- [References](https://github.com/mp-lb/zog/blob/main/packages/zog/docs/references.md) — fields that hold another model's primary key.
- [Model diagrams](https://github.com/mp-lb/zog/blob/main/packages/zog/docs/diagrams.md) — render schemas and references as ASCII or Mermaid.

Everything else is in the shipped TypeScript declarations — hover any export for
its signature, parameters, and return type.

## Documentation tier

Zog is a **Tier 0** library: the bundled `.d.ts` declarations plus this README
are the whole documentation story. There is no generated API site.

## License

MIT
