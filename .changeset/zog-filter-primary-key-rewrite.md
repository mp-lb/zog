---
"@mp-lb/zog": minor
---

Make primary-key rewriting consistent across the whole query surface and tighten
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
