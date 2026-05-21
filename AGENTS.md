# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

It exists to give Zod-first TypeScript applications a reliable storage boundary
without adopting an ORM programming model. The library keeps MongoDB close to
the official driver while handling the repeated invariants that are easy to get
wrong by hand:

- map domain primary keys such as `id` to MongoDB `_id`
- prevent accidental generated ObjectIds for app-owned records
- parse writes through a Zod-like schema before storage
- parse reads through a Zod-like schema before returning domain records
- keep model metadata and index declarations near the collection definition
- expose the raw MongoDB collection when native driver behavior is needed

Read [STORY.md](STORY.md) for the project justification and architectural line.
Read [SPEC.md](SPEC.md) for the current behavior contract.
Read [docs/features.md](docs/features.md) for the backlog and feature direction.

## Design Boundary

Zog should provide ORM-grade reliability for storage invariants without becoming
an ORM.

Good fit:

- timestamps
- index management
- legacy normalization
- transaction/session support
- optimistic concurrency
- narrow storage-boundary hooks
- safer common update helpers

Non-goals:

- entity classes
- identity map
- unit of work
- lazy loading
- automatic relationship population
- cascading persistence
- broad query builder abstraction
- generated clients

If a proposed feature needs Zog to manage an object graph, it probably belongs
in Mongoose, MikroORM, or Prisma instead.

## Development Notes

- Keep the public API small and close to the MongoDB driver.
- Keep Zod as the schema source of truth.
- Prefer explicit application/service behavior over hidden lifecycle behavior.
- Automate mechanical invariants that are easy to silently forget.
- Do not add business-workflow hooks or cross-collection magic.
- Preserve the `raw` escape hatch for advanced MongoDB operations.
- Use named indexes when stable operational behavior matters.

## Validation

Before finishing code changes, run:

```sh
pnpm test
pnpm typecheck
pnpm build
```

For docs-only changes, tests are not required unless behavior examples changed
in a way that should be compiled or exercised.
