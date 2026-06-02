---
"@mp-lb/zog": patch
---

Cache collection-name compatibility resolution at the db level. In any
`collectionNameCompatibility` mode other than the `"off"` fast path, zog
previously issued a `listCollections` call on every read/write operation. The
collection-name set is now loaded at most once per `Db` and shared across every
repository built against it, so the common pattern of constructing a fresh,
session-bound repository per operation no longer re-lists on each call. The
cache is keyed by `Db` identity, so it never leaks across databases or clients.
Resolution stays lazy (first use) and all compatibility-mode semantics and
`ZogError`s are unchanged.
