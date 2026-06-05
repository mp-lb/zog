# Schema Evolution

Zog keeps migration concerns outside the current schema. Use this page when the
stored shape has history, but application code should only see the current
model.

## Collection Names

If the logical model name differs from the physical Mongo collection, pass
`collectionName`:

```ts
const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  collectionName: "user_accounts",
});
```

If a collection used to have another name, declare it as legacy:

```ts
const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  collectionName: "user_accounts",
  legacyCollectionNames: ["users"],
});
```

If `user_accounts` does not exist yet but `users` does, repository and index
operations use the declared legacy collection. If both names exist, Zog throws
instead of choosing between split data.

## Collection Name Policy

Use `collectionNamePolicy` when you want a naming rule for every model:

```ts
const db = defineDb([userModel] as const, {
  mongoClient,
  databaseName: "app",
  collectionNamePolicy: "snake",
  collectionNameCompatibility: "error",
});
```

`collectionNameCompatibility: "error"` adds a guard before repository and index
operations, so an undeclared old collection is reported before Zog creates a new
one.

## Key Renames

For stored documents that still use old key names, declare read-time key
renames:

```ts
const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  legacyKeyRenames: [
    { from: "full_name", to: "name" },
    { from: "profile.display_name", to: "profile.displayName" },
    { from: "teams[].members[].full_name", to: "teams[].members[].name" },
  ],
});
```

`legacyKeyRenames` runs before schema parsing on reads. `[]` applies the rename
to every object in an array. If both the legacy and current keys exist, the
current key wins. Zog removes the legacy key from the parse candidate, but does
not rewrite MongoDB automatically.

## Custom Legacy Shapes

Use `normalizeLegacy` when the old shape needs custom code:

```ts
const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  normalizeLegacy: (doc) => ({
    ...doc,
    name: doc.name ?? [doc.firstName, doc.lastName].filter(Boolean).join(" "),
  }),
});
```

Declarative key renames run before `normalizeLegacy`, so the custom function can
focus on the cases that are not simple renames.
