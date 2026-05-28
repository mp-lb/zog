# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

It keeps application models in terms of `id`, stores that key canonically as
Mongo `_id`, and parses every read and write through Zod at the storage
boundary. The repository API stays close to the MongoDB collection API and
exposes `raw` for operations that should bypass Zog.

Docs:

- [Quick start](docs/quick-start.md) for the basic model and repository flow.
- [Schema evolution](docs/schema-evolution.md) for legacy collection names, key renames, and custom normalization.
- [Indexes](docs/indexes.md) for declaring, diffing, and syncing MongoDB indexes.
- [Model diagrams](docs/diagrams.md) for rendering schemas and references as ASCII or Mermaid.
