# Story

Zog exists because using MongoDB directly from a Zod-first TypeScript codebase is almost right, but the rough edges repeat in every collection.

The goal is not to build an ORM. The goal is to keep MongoDB's native document model and driver API, while making the storage boundary explicit enough that application code can keep using ordinary domain objects validated by Zod.

## The Problem

In our projects, Zod schemas are already the source of truth for core domain records. They define the runtime shape of application data, the TypeScript types inferred from that shape, and the validation rules at API boundaries.

MongoDB is a good fit for that style because records are already documents. There is no table-to-object impedance mismatch to hide. But there are still persistence details that leak into application code when we use the MongoDB driver directly:

- Domain records use `id`; MongoDB uses `_id`.
- If `_id` is missing, MongoDB creates an ObjectId, even when the application expected a string id.
- Reads need to parse untrusted stored data through Zod.
- Writes need to parse inputs before they become durable data.
- Filters, updates, projections, and sorts often need `id` translated to `_id`.
- Legacy documents need deliberate normalization instead of ad hoc cleanup at every call site.
- Index definitions need somewhere stable to live near the collection they support.
- The raw driver is still necessary for advanced MongoDB operations.

Without a small layer, every repository reimplements the same translation code. Doctrine had exactly that pattern in `createMongoDomainCollection`: translate `id` to `_id`, translate filters and updates, parse documents after reads, and expose a narrowed collection-shaped API. Zog is the reusable version of that code.

## What Zog Does

Zog defines a model as a small piece of collection metadata:

- the logical model name
- the physical collection name
- the Zod-like schema with a synchronous `parse()` method
- the primary key field used by domain code
- optional index declarations
- optional legacy normalization

From that, it creates repositories that stay close to the MongoDB collection API.

On writes, Zog parses the input through the schema, moves the configured primary key to MongoDB's canonical `_id`, and prevents MongoDB from inventing accidental ObjectIds for app-owned records.

On reads, Zog maps `_id` back to the configured domain primary key, applies any legacy normalization, and parses the result through the schema before application code sees it.

For indexes, Zog lets models declare normal MongoDB index descriptions and exposes `ensureIndexes()`, `diffIndexes()`, and `syncIndexes()`. Indexes remain MongoDB indexes; Zog only gives them a home and a repeatable lifecycle.

For advanced operations, Zog exposes `raw`, the underlying MongoDB collection. The library should never pretend it can or should compile every MongoDB query shape.

## What Zog Is Not

Zog is not an ORM in the classic sense.

It does not provide:

- entity classes
- decorators
- identity maps
- unit of work
- lazy loading
- relation modeling
- cascading persistence
- change tracking
- query builders
- migrations
- hidden document lifecycle behavior

Those features can be useful, but they solve a different problem. In MongoDB, the important mismatch for our current projects is not object-relational mapping. It is the smaller mismatch between domain records and durable BSON documents.

Zog should remain boring. It should make the storage boundary harder to get wrong, then get out of the way.

## Why Not Just Use The MongoDB Driver?

Using the driver directly is reasonable for one-off collections. It becomes noisy when every collection needs the same policy:

- app ids are strings
- Mongo stores the canonical primary key as `_id`
- stored data is parsed on every read
- write inputs are parsed on every insert or replacement
- update operations cannot accidentally change the primary key
- legacy documents are normalized in one predictable place
- indexes are declared next to collection metadata

The driver provides the primitives. Zog packages our house rules around those primitives.

## Why Not Mongoose, MikroORM, Or Prisma?

Mongoose, MikroORM, and Prisma are serious tools with larger answers.

Mongoose has a mature MongoDB model layer with schema declarations, middleware, validation, automatic index creation, and index sync. It is a good choice when a project wants Mongoose documents and Mongoose's model lifecycle.

MikroORM has a MongoDB driver, entity metadata, repositories, identity map, unit of work, schema generation, migrations, relationships, and index support. It is a good choice when a project wants a full ORM architecture.

Prisma has its own schema language, generated client, and migration workflow. It is a good choice when a project wants Prisma's data modeling and generated API.

Zog exists for the narrower case where we already chose:

- Zod as the schema source of truth
- the official MongoDB driver as the operational primitive
- plain records instead of entity instances
- explicit repository calls instead of an ORM runtime
- minimal abstraction over native MongoDB behavior

If an existing tool lets us keep those choices without adding a second schema system or a heavier persistence runtime, we should consider replacing Zog. If adopting the tool means moving our domain model into entity classes, decorators, generated clients, or a different schema language, then it is solving a broader problem than Zog is meant to solve.

## Does This Library Need To Exist?

It needs to exist if we keep building Zod-first MongoDB services that do not want an ORM.

The justification is strongest when:

- multiple collections share the same `id`/`_id` policy
- Zod schemas already live in core packages shared across apps
- MongoDB is used mostly as a document store, not as an entity graph
- repositories should feel like the native MongoDB driver
- runtime validation at the storage boundary matters
- index declarations should live with model metadata
- the team wants small, inspectable behavior over framework machinery

The justification is weak if:

- we want entity classes and rich model methods
- we want identity maps or unit-of-work semantics
- we want relationship modeling and cascading persistence
- we want generated database clients
- we want schema migrations as a central product feature
- we are willing to make Mongoose, MikroORM, or Prisma the source of truth for persistence

The decision is not "ORMs are bad." The decision is whether our projects need an ORM-shaped solution. Today, Zog exists because our recurring pain is smaller than that: Zod records plus MongoDB documents need a reliable boundary.

## Product Line

Zog should be described as:

> A tiny Zod-first persistence layer for MongoDB.

More specifically:

> Mongoose-style model metadata for teams that want Zod schemas, plain records, and the official MongoDB driver instead of an ORM.

That is the shape worth preserving. If Zog grows into an ORM, it has probably lost the reason it was created.
