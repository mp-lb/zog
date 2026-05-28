import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel, ref, validateModelReferences } from "../src/index.js";
import type { ZogSchema } from "../src/index.js";

const userSchema = z.object({
  id: z.string(),
  accountNumber: z.number(),
});

const userModel = createModel("users", userSchema, {
  primaryKey: "id",
});

describe("model references", () => {
  it("stores validated references on a model", () => {
    const postSchema = z.object({
      id: z.string(),
      authorId: z.string(),
    });

    const postModel = createModel("posts", postSchema, {
      primaryKey: "id",
      references: [ref("authorId", userModel)],
    });

    expect(postModel.references).toEqual([
      {
        path: "authorId",
        target: userModel,
        optional: false,
        nullable: false,
      },
    ]);
  });

  it("accepts nested references inside embedded document arrays", () => {
    const teamSchema = z.object({
      id: z.string(),
      teams: z.array(
        z.object({
          members: z.array(
            z.object({
              userId: z.string(),
            }),
          ),
        }),
      ),
    });

    expect(() =>
      createModel("teams", teamSchema, {
        primaryKey: "id",
        references: [ref("teams[].members[].userId", userModel)],
      }),
    ).not.toThrow();
  });

  it("accepts scalar id arrays", () => {
    const groupSchema = z.object({
      id: z.string(),
      memberIds: z.array(z.string()),
    });

    expect(() =>
      createModel("groups", groupSchema, {
        primaryKey: "id",
        references: [ref("memberIds[]", userModel)],
      }),
    ).not.toThrow();
  });

  it("rejects references to missing fields", () => {
    const postSchema = z.object({
      id: z.string(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("authorId", userModel)],
      }),
    ).toThrow("authorId does not exist");
  });

  it("rejects optional reference fields unless the reference allows them", () => {
    const postSchema = z.object({
      id: z.string(),
      authorId: z.string().optional(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("authorId", userModel)],
      }),
    ).toThrow("authorId is optional");

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("authorId", userModel, { optional: true })],
      }),
    ).not.toThrow();
  });

  it("rejects nullable reference fields unless the reference allows them", () => {
    const postSchema = z.object({
      id: z.string(),
      deletedByUserId: z.string().nullable(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("deletedByUserId", userModel)],
      }),
    ).toThrow("deletedByUserId is nullable");

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("deletedByUserId", userModel, { nullable: true })],
      }),
    ).not.toThrow();
  });

  it("rejects reference fields that do not match the target primary key type", () => {
    const postSchema = z.object({
      id: z.string(),
      authorId: z.number(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("authorId", userModel)],
      }),
    ).toThrow("type mismatch");
  });

  it("rejects array markers on non-array fields", () => {
    const postSchema = z.object({
      id: z.string(),
      authorId: z.string(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("authorId[]", userModel)],
      }),
    ).toThrow("authorId is not an array");
  });

  it("rejects traversal through scalar fields", () => {
    const postSchema = z.object({
      id: z.string(),
      author: z.string(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("author.id", userModel)],
      }),
    ).toThrow("cannot read id from string");
  });

  it("supports number primary keys", () => {
    const accountModel = createModel("accounts", userSchema, {
      primaryKey: "accountNumber",
    });
    const postSchema = z.object({
      id: z.string(),
      accountNumber: z.number(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("accountNumber", accountModel)],
      }),
    ).not.toThrow();
  });

  it("rejects target models with optional primary keys", () => {
    const accountSchema = z.object({
      id: z.string().optional(),
    });
    const accountModel = createModel("accounts", accountSchema, {
      primaryKey: "id",
    });
    const postSchema = z.object({
      id: z.string(),
      accountId: z.string(),
    });

    expect(() =>
      createModel("posts", postSchema, {
        primaryKey: "id",
        references: [ref("accountId", accountModel)],
      }),
    ).toThrow("target primary key accounts.id is optional");
  });

  it("requires Zod 4 schemas when validating references", () => {
    const fakeSchema: ZogSchema<{ id: string }> = {
      parse(input: unknown) {
        return input as { id: string };
      },
    };

    expect(() =>
      validateModelReferences({
        name: "legacy",
        schema: fakeSchema,
        references: [ref("id", userModel)],
      }),
    ).toThrow("Zog references require Zod 4 schemas");
  });
});
