# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

It keeps application models in terms of `id`, stores that key canonically as
Mongo `_id`, and parses every read and write through Zod at the storage
boundary. The repository API stays close to the MongoDB collection API and
exposes `raw` for operations that should bypass Zog.

See [docs/quick-start.md](docs/quick-start.md) for local usage.
