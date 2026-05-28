import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createModel,
  ref,
  renderDbDiagram,
  renderModelDiagram,
  uniqueIndex,
  writeDbDiagramFile,
  writeModelDiagramFile,
} from "../src/index.js";
import type { AnyModelDefinition, ZogSchema } from "../src/index.js";

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "disabled"]),
});

const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  indexes: [uniqueIndex({ email: 1 }, { name: "users_email_unique" })],
});

const postSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  metadata: z.object({
    reviewedByUserId: z.string().optional(),
  }),
  comments: z.array(
    z.object({
      authorId: z.string(),
      body: z.string(),
    }),
  ),
  tagIds: z.array(z.string()),
  deletedByUserId: z.string().nullable(),
});

const postModel = createModel("posts", postSchema, {
  primaryKey: "id",
  references: [
    ref("authorId", userModel),
    ref("metadata.reviewedByUserId", userModel, { optional: true }),
    ref("comments[].authorId", userModel),
    ref("tagIds[]", userModel),
    ref("deletedByUserId", userModel, { nullable: true }),
  ],
});

describe("model diagrams", () => {
  it("renders a combined ASCII model diagram", () => {
    expect(renderModelDiagram(postModel)).toMatchInlineSnapshot(`
      "posts collection (posts)
      ├── _id <- id: string [primary]
      ├── authorId: string -> users.id
      ├── metadata: object
      │   └── reviewedByUserId?: string -> users.id
      ├── comments: object[]
      │   ├── authorId: string -> users.id
      │   └── body: string
      ├── tagIds: string[] -> users.id
      └── deletedByUserId: string | null -> users.id"
    `);
  });

  it("can render schema only without reference annotations", () => {
    expect(renderModelDiagram(postModel, { view: "schema" })).toContain(
      "├── authorId: string\n",
    );
    expect(renderModelDiagram(postModel, { view: "schema" })).not.toContain("-> users.id");
  });

  it("renders relationship-only ASCII diagrams", () => {
    expect(renderDbDiagram([userModel, postModel], { view: "relationships" }))
      .toMatchInlineSnapshot(`
        "posts.authorId -> users.id
        posts.metadata.reviewedByUserId -> users.id
        posts.comments[].authorId -> users.id
        posts.tagIds[] -> users.id
        posts.deletedByUserId -> users.id"
      `);
  });

  it("renders a combined Mermaid diagram", () => {
    expect(renderDbDiagram([userModel, postModel], { format: "mermaid" }))
      .toMatchInlineSnapshot(`
        "flowchart TD
          zog_users_collection["users (users)"]
          zog_users__id["_id <- id: string [primary]"]
          zog_users_collection --> zog_users__id
          zog_users_email["email: string"]
          zog_users_collection --> zog_users_email
          zog_users_status["status: \\"active\\" | \\"disabled\\""]
          zog_users_collection --> zog_users_status
          zog_users_index_users_email_unique["index users_email_unique unique (email: 1)"]
          zog_users_collection -.-> zog_users_index_users_email_unique
          zog_posts_collection["posts (posts)"]
          zog_posts__id["_id <- id: string [primary]"]
          zog_posts_collection --> zog_posts__id
          zog_posts_authorId["authorId: string"]
          zog_posts_collection --> zog_posts_authorId
          zog_posts_metadata["metadata: object"]
          zog_posts_collection --> zog_posts_metadata
          zog_posts_metadata_reviewedByUserId["reviewedByUserId?: string"]
          zog_posts_metadata --> zog_posts_metadata_reviewedByUserId
          zog_posts_comments__["comments: object[]"]
          zog_posts_collection --> zog_posts_comments__
          zog_posts_comments___authorId["authorId: string"]
          zog_posts_comments__ --> zog_posts_comments___authorId
          zog_posts_comments___body["body: string"]
          zog_posts_comments__ --> zog_posts_comments___body
          zog_posts_tagIds__["tagIds: string[]"]
          zog_posts_collection --> zog_posts_tagIds__
          zog_posts_deletedByUserId["deletedByUserId: string | null"]
          zog_posts_collection --> zog_posts_deletedByUserId
          zog_posts_authorId -.->|users.id| zog_users__id
          zog_posts_metadata_reviewedByUserId -.->|users.id| zog_users__id
          zog_posts_comments___authorId -.->|users.id| zog_users__id
          zog_posts_tagIds__ -.->|users.id| zog_users__id
          zog_posts_deletedByUserId -.->|users.id| zog_users__id"
      `);
  });

  it("renders relationship-only Mermaid diagrams", () => {
    expect(
      renderDbDiagram([userModel, postModel], {
        format: "mermaid",
        view: "relationships",
      }),
    ).toMatchInlineSnapshot(`
      "flowchart TD
        zog_users_model["users"]
        zog_posts_model["posts"]
        zog_posts_model -->|authorId| zog_users_model
        zog_posts_model -->|metadata.reviewedByUserId| zog_users_model
        zog_posts_model -->|comments[].authorId| zog_users_model
        zog_posts_model -->|tagIds[]| zog_users_model
        zog_posts_model -->|deletedByUserId| zog_users_model"
    `);
  });

  it("requires Zod 4 schemas for diagram rendering", () => {
    const fakeSchema: ZogSchema<{ id: string }> = {
      parse(input: unknown) {
        return input as { id: string };
      },
    };
    const fakeModel = {
      name: "legacy",
      collectionName: "legacy",
      legacyCollectionNames: [],
      legacyKeyRenames: [],
      references: [],
      schema: fakeSchema,
      primaryKey: "id",
      indexes: [],
      objectIdPolicy: "reject",
    } satisfies AnyModelDefinition;

    expect(() => renderModelDiagram(fakeModel)).toThrow(
      "Zog diagram rendering requires Zod 4 schemas",
    );
  });

  it("writes Markdown diagram files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zog-diagrams-"));
    const filePath = join(directory, "docs", "models.md");

    try {
      const written = await writeDbDiagramFile(filePath, [userModel, postModel], {
        format: "mermaid",
        title: "Data Models",
      });

      expect(written).toContain("# Data Models\n\n```mermaid\nflowchart TD");
      expect(await readFile(filePath, "utf8")).toBe(written);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("writes raw diagram files for non-Markdown paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zog-diagrams-"));
    const filePath = join(directory, "models.txt");

    try {
      const written = await writeModelDiagramFile(filePath, postModel);

      expect(written).toMatch(/^posts collection \(posts\)\n├──/);
      expect(written).not.toContain("```");
      expect(await readFile(filePath, "utf8")).toBe(written);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
