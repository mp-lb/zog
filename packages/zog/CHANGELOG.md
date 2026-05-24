# @mp-lb/zog

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
