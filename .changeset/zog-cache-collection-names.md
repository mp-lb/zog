---
"@mp-lb/zog": patch
---

Cache collection-name compatibility resolution per repository instance. In any
`collectionNameCompatibility` mode other than the `"off"` fast path, zog
previously issued a `listCollections` call on every read/write operation. The
collection-name set is now loaded at most once per `(db, model)` and reused,
removing a per-operation latency tax on hot paths. Resolution stays lazy (first
use) and all compatibility-mode semantics and `ZogError`s are unchanged.
