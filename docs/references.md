# References

References describe fields that contain another model's primary key. They do
not enforce that the referenced document exists in MongoDB, but they do verify
that your model definitions agree with your Zod schemas.

```ts
import { createModel, ref } from "@mp-lb/zog";
import { z } from "zod";

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

export const userModel = createModel("users", userSchema, {
  primaryKey: "id",
});

const postSchema = z.object({
  id: z.string(),
  authorId: z.string(),
});

export const postModel = createModel("posts", postSchema, {
  primaryKey: "id",
  references: [ref("authorId", userModel)],
});
```

When `postModel` is created, Zog checks that `authorId` exists, is required,
is non-null, and has the same schema type as `userModel`'s primary key.

Reference paths can point through embedded documents and arrays with dotted
paths and `[]` array markers:

```ts
ref("members[].userId", userModel);
ref("teams[].members[].userId", userModel);
```

References are required and non-null by default. Mark optional or nullable
references explicitly:

```ts
ref("reviewedByUserId", userModel, { optional: true });
ref("deletedByUserId", userModel, { nullable: true });
```

Zog does not check whether the referenced document exists in MongoDB. That
would require database reads and application-specific consistency choices.

Reference validation requires Zod 4 schemas because Zog introspects schema
internals for this feature.
