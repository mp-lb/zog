# @mp-lb/zog

## 0.7.0

### Minor Changes

- cbedcad: Make primary-key rewriting consistent across the whole query surface and tighten
  filter typing. **Breaking** in two ways:
  - Filters now rewrite the renamed primary key to `_id` recursively, inside
    `$and`/`$or`/`$nor` branches as well as at the top level — previously only a
    top-level primary-key match was translated, so the key buried in a logical
    operator silently matched nothing. Opaque operators (`$where`, `$expr`,
    aggregation pipelines) are left untouched by design; query the primary key as
    `_id` directly inside them.
  - When the primary key is renamed (anything other than `_id`), referencing `_id`
    directly in a filter or write now throws a `ZogError` instead of silently
    clobbering the renamed key. Use the domain primary-key name instead.
  - `Filter<T>` is now typed against the model's own fields (the `& Document`
    any-escape was removed), so the value of a known field is type-checked rather
    than accepted as `any`.
    </content>

### Patch Changes

- f1b8cdd: Cache collection-name compatibility resolution at the db level. In any
  `collectionNameCompatibility` mode other than the `"off"` fast path, zog
  previously issued a `listCollections` call on every read/write operation. The
  collection-name set is now loaded at most once per `Db` and shared across every
  repository built against it, so the common pattern of constructing a fresh,
  session-bound repository per operation no longer re-lists on each call. The
  cache is keyed by `Db` identity, so it never leaks across databases or clients.
  Resolution stays lazy (first use) and all compatibility-mode semantics and
  `ZogError`s are unchanged.

## 0.6.1

### Patch Changes

- 7462b20: Cache collection-name compatibility resolution per repository instance. In any
  `collectionNameCompatibility` mode other than the `"off"` fast path, zog
  previously issued a `listCollections` call on every read/write operation. The
  collection-name set is now loaded at most once per `(db, model)` and reused,
  removing a per-operation latency tax on hot paths. Resolution stays lazy (first
  use) and all compatibility-mode semantics and `ZogError`s are unchanged.

## 0.6.0

### Minor Changes

- c7ed195: Add model references and diagram rendering

## 0.5.0

### Minor Changes

- c2929ac: Add declarative `legacyKeyRenames` for read-time stored key renames, including nested paths through arrays.

## 0.4.0

### Minor Changes

- 9af142c: Add per-model legacy collection names

## 0.3.0

### Minor Changes

- ec50f47: Add collection name compatibility checks for legacy naming schemes

## 0.2.1

### Patch Changes

- 99819fc: Handle legacy Mongo documents with app primary keys

  Zog now treats an existing domain primary key field as authoritative on reads, even when Mongo `_id` contains a generated ObjectId. `findById` also falls back to legacy documents that still store the app primary key field directly.

## 0.2.0

### Minor Changes

- 4646fcb: Add opt-in repository-managed timestamps for model writes and explicit MongoDB
  session/transaction helpers. Add `setById()` for safer validated field updates.
  Add opt-in collection name policy enforcement.

## 0.1.2

### Patch Changes

- Validate the monorepo release process.

## 0.0.1

Initial Zog library package.
