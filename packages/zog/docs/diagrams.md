# Model diagrams

Zog can render model schemas and validated references as ASCII or Mermaid diagrams.

The diagram API is designed to run inside your app or an app-owned script. That keeps
Zog out of your TypeScript loader, path alias, bundler, and environment setup.

```ts
// scripts/write-model-diagram.ts
import { writeDbDiagramFile } from "@mp-lb/zog";
import { models } from "../src/models";

await writeDbDiagramFile("docs/data-models.md", models, {
  format: "mermaid",
  title: "Data Models",
});
```

Run it with the TypeScript runner your project already uses:

```bash
tsx scripts/write-model-diagram.ts
```

Markdown files (`.md` and `.mdx`) are written with a fenced code block. Other file
extensions are written as raw diagram text.

```ts
await writeDbDiagramFile("docs/data-models.txt", models);
await writeDbDiagramFile("docs/data-models.mmd", models, { format: "mermaid" });
```

Use the pure renderers when you want to print or compose the output yourself:

```ts
import { renderDbDiagram } from "@mp-lb/zog";

console.log(renderDbDiagram(models));
console.log(renderDbDiagram(models, { format: "mermaid" }));
```

The default view combines schema shape and references:

```txt
posts collection (posts)
├── _id <- id: string [primary]
├── authorId: string -> users.id
├── comments: object[]
│   ├── authorId: string -> users.id
│   └── body: string
└── tagIds: string[] -> tags.id
```

You can also render schema-only or relationships-only views:

```ts
renderDbDiagram(models, { view: "schema" });
renderDbDiagram(models, { view: "relationships" });
```

Diagram rendering requires Zod 4 schemas because it introspects schema internals.
