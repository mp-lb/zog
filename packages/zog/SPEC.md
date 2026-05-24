# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

The goal is not to build an ORM. The goal is to make the boundary between
domain objects and Mongo documents explicit, typed, and boring.

## Motivation

Doctrine already treats Zod schemas as the source of truth for core domain
models. MongoDB is simple and flexible, but that flexibility creates subtle
drift when persistence details leak into application code.

The immediate example is `id` vs `_id`:

- Application code wants to think in terms of `id`.
- Mongo wants a primary key field called `_id`.
- If a document is inserted without `_id`, Mongo creates an ObjectId.
- That creates records where the real app id lives in `id`, while `_id` is an
  accidental storage artifact.

Zog should make that impossible by default.

## Principles

- Zod schemas live in central core modules.
- Domain models use `id`, not `_id`.
- Mongo `_id` is a persistence detail.
- Every write is parsed through Zod before it reaches Mongo.
- Every read is parsed through Zod before it reaches application code.
- Unknown legacy keys are stripped intentionally at the storage boundary.
- Indexes live next to model definitions.
- The API is small and explicit. No model classes, decorators, magic hooks, or
  query language.

## Model Definition

Example core schema:

```ts
export const userSchema = z.object({
  id: z.string().trim().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;
```

Example model:

```ts
export const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  indexes: [uniqueIndex({ email: 1 })],
});
```

`createModel` accepts a schema-like object with a synchronous `parse()` method
rather than requiring a nominal Zod type. This avoids type identity issues when
Zog is linked into a consuming project that resolves its own compatible Zod
peer dependency.

Schemas with transforms and pipes are supported. The parsed output type is the
domain type used by repository reads, and `primaryKey` is constrained against
that parsed output.

Models may use a logical model name and a different physical Mongo collection:

```ts
export const storeModel = createModel("stores", storeSchema, {
  collectionName: "store_metadata",
  primaryKey: "id",
});
```

Applications may opt into collection name policy enforcement at the Zog
boundary:

```ts
export const db = defineDb([storeModel] as const, {
  mongoClient,
  databaseName,
  collectionNamePolicy: "snake",
  collectionNameCompatibility: "error",
});
```

Supported policies are `"camel"`, `"snake"`, and `"pascal"`. The default is
`null`, which disables enforcement. When a policy is enabled, Zog throws before
creating repositories or index helpers for collection names that do not match
the policy.

`collectionNameCompatibility` defaults to `"off"`. Use `"error"` during
migrations or deployments that need a compatibility check for legacy collection
names. Zog lists existing MongoDB collections before repository and index
operations that touch MongoDB, then throws if a different collection has the
same normalized identity as the model collection name. For example, a model
targeting `store_metadata` will reject an existing `store-metadata` collection
instead of accidentally creating a second collection. Direct MongoDB driver
access remains outside Zog's boundary.

Example database:

```ts
export const db = defineDb([userModel, storeModel, jobModel] as const, {
  mongoClient,
  databaseName,
});

await db.users.findOne({ email });
await db.users.find({ email }).sort({ createdAt: -1 }).toArray();
await db.users.insertOne(user);
await db.users.replaceOne({ id: user.id }, user);
await db.users.raw.aggregate([]).toArray();
```

`db.users` should be produced as a plain object key inferred from the literal
model name. A `Proxy` is unnecessary unless we later need lazy repository
construction.

## Mongo Mapping

For models with `primaryKey: "id"`:

- Domain object: `{ id: "abc", ... }`
- Mongo document: `{ _id: "abc", ... }`

Mongo stores one canonical primary key field: `_id`. The domain primary key is
restored on reads before Zod parsing. This keeps Mongo documents explicit while
preventing duplicated primary key fields from drifting.

## Read Path

Reads should follow this flow:

```ts
const raw = await collection.findOne({ _id: id });
const domainCandidate = fromMongo(raw);
return schema.parse(domainCandidate);
```

`fromMongo` should:

- copy `_id` to the configured primary key when that key is missing
- reject or normalize ObjectId `_id` according to model config
- leave non-primary fields alone

If a document cannot parse, the repository should throw a storage/schema error
that includes the collection name and operation.

## Write Path

Writes should follow this flow:

```ts
const parsed = schema.parse(input);
const document = toMongo(parsed);
await collection.replaceOne({ _id: parsed.id }, document, { upsert: true });
```

`toMongo` should:

- require a valid primary key
- set `_id` from the domain primary key
- remove the domain primary key field from the stored document unless the
  configured primary key is already `_id`
- never allow Mongo to generate an ObjectId for app-owned records

## Timestamps

Models may opt into repository-managed timestamps:

```ts
export const jobModel = createModel("jobs", jobSchema, {
  primaryKey: "id",
  timestamps: {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    now: () => new Date().toISOString(),
  },
});
```

When configured, parsed repository writes set `createdAt` and `updatedAt` on
inserts and advance `updatedAt` on replacements and update helpers. The
`now()` callback owns the stored value type, so models can choose ISO strings,
BSON Dates, or another schema-compatible representation. `raw` collection
operations are not modified.

## Repository API

The repository should feel like a MongoDB collection with a Zod boundary:

```ts
type Repository<TOutput, TInput = TOutput> = {
  raw: Collection<Document>;
  find(filter?: Filter<TOutput>, options?: FindOptions<TOutput>): ParsedFindCursor<TOutput>;
  findById(id: string): Promise<TOutput | null>;
  findOne(filter?: Filter<TOutput>, options?: FindOneOptions): Promise<TOutput | null>;
  findMany(filter: Filter<TOutput>, options?: FindOptions<TOutput>): Promise<TOutput[]>;
  insertOne(value: TInput, options?: InsertOneOptions): Promise<InsertOneResult>;
  replaceOne(filter: Filter<TOutput>, value: TInput, options?: ReplaceOptions): Promise<UpdateResult>;
  updateOne(filter: Filter<TOutput>, update: UpdateFilter<TOutput>, options?: UpdateOptions): Promise<UpdateResult>;
  findOneAndUpdate(...): Promise<TOutput | null>;
  deleteOne(filter?: Filter<TOutput>, options?: DeleteOptions): Promise<DeleteResult>;

  // Compatibility helpers:
  insert(value: TInput): Promise<TOutput>;
  replace(value: TInput): Promise<TOutput>;
  setById(id: string, patch: Partial<TOutput>): Promise<TOutput | null>;
  updateById(id: string, patch: Partial<TOutput>): Promise<TOutput | null>;
  deleteById(id: string): Promise<void>;
};
```

Simple top-level primary-key filters should map to `_id`:

```ts
db.stores.findOne({ id: storeId }); // queries Mongo by _id
```

Zog should not deeply compile every Mongo query shape. Use `raw` for operations
that need exact MongoDB driver behavior.

Non-primary filters should remain normal Mongo-style filters:

```ts
db.stores.findOne({ workspaceId, slug });
```

For safer field updates, use `setById()`. It fetches the current document,
merges the patch, validates the resulting document through Zod, writes only the
patched fields with `$set`, and returns the parsed updated document:

```ts
const updated = await db.users.setById(user.id, { name: "Updated User" });
```

Raw MongoDB update operators remain available through `updateOne()`,
`updateMany()`, `findOneAndUpdate()`, and `raw`, but arbitrary update
expressions cannot be fully schema-validated before storage.

## Sessions And Transactions

Mongo-shaped repository methods accept the MongoDB driver's options objects, so
callers may pass `session` directly:

```ts
await db.users.insertOne(user, { session });
await db.users.updateOne({ id: user.id }, { $set: { name } }, { session });
```

For repository helpers that do not expose the full driver options surface, bind
repositories to an explicit session:

```ts
const tx = db.withSession(session);
await tx.users.insert(user);
await tx.users.updateById(user.id, { name });
```

Applications may also run explicit transaction scopes:

```ts
await db.transaction(async (tx) => {
  await tx.users.insert(user);
  await tx.auditLogs.insert(log);
});
```

`transaction()` starts a MongoDB session, passes session-bound repositories to
the callback, delegates commit/abort behavior to `session.withTransaction()`,
and ends the session afterwards. The transaction context exposes `tx.session`
for driver-native operations that need the same transaction.

## Indexes

Indexes should be declared with the model:

```ts
export const storeModel = createModel("stores", storeSchema, {
  primaryKey: "id",
  indexes: [
    uniqueIndex(
      { workspaceId: 1, slug: 1 },
      { partialFilterExpression: { archivedAt: null } },
    ),
    index({ workspaceId: 1, storeId: 1 }),
  ],
});
```

The adapter should expose:

```ts
await db.ensureIndexes();
const diff = await db.diffIndexes();
const dryRun = await db.syncIndexes({ dryRun: true });
await db.syncIndexes();
```

Index creation should be idempotent and should support named indexes where we
need stable migration behavior.

`ensureIndexes()` is additive. It creates declared indexes but does not inspect
or drop existing indexes.

`diffIndexes()` compares declared indexes with existing collection indexes and
reports matching, missing, changed, and extra indexes. MongoDB's required `_id_`
index is ignored.

`syncIndexes()` reconciles the collection with the model declaration. It drops
changed indexes, creates missing and changed declared indexes, and drops extra
indexes by default. Use `{ dryRun: true }` to inspect the plan without mutating
MongoDB. Use `{ dropExtra: false }` to leave undeclared indexes in place while
still fixing changed declared indexes.

Models may define a pre-index hook for local cleanup of legacy indexes:

```ts
export const fileModel = createModel("files", fileSchema, {
  primaryKey: "id",
  beforeEnsureIndexes: async (collection) => {
    await dropLegacyIndexes(collection);
  },
  indexes: [index({ workspaceId: 1, path: 1 })],
});
```

## Legacy Normalization

Models may define a legacy normalizer:

```ts
export const storeModel = createModel("stores", storeSchema, {
  primaryKey: "id",
  normalizeLegacy: (raw) => ({
    ...raw,
    id: raw.id ?? raw._id,
  }),
});
```

This supports:

- read-time tolerance while migrating
- reusable normalization migrations
- deliberate stripping of stale keys by parse-and-replace

## Dates And BSON

Doctrine currently prefers ISO strings for timestamps.

Zog should not introduce automatic date conversion initially. Mongo can store
BSON Dates, but implicit date conversion creates another hidden boundary.

Default policy:

- timestamps are ISO strings
- schemas use `z.string().datetime()`
- date conversion is opt-in per field/model later if needed

## Error Handling

Repository errors should identify:

- model name
- collection name
- operation
- primary key or filter summary
- Zod validation issues when available

This should make bad data obvious without leaking huge documents into logs.

## Rollout Plan

1. Build `createMongoZodCollection` internally in `packages/store-storage`.
2. Migrate `stores` first because `id` vs `_id` has already caused drift.
3. Add a reusable `normalize-document-ids` migration using model metadata.
4. Move `workspaceProfiles`, `jobs`, and `askLogs` onto the adapter.
5. Move file records only after deciding whether file domain models should use
   `id` or continue using `_id` internally.
6. Once stable, consider extracting the adapter into a tiny library.

## Non-Goals

- No model classes.
- No decorators.
- No population layer.
- No lifecycle hook system.
- No full query compiler.
- No replacement for Zod.
- No replacement for the MongoDB driver.

Zog should stay close to raw MongoDB and raw Zod. Its job is to make the
storage boundary correct by construction.
