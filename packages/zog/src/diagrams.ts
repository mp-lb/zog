import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { toDeclaredIndex } from "./indexes.js";
import type { AnyModelDefinition } from "./model.js";

export type ModelDiagramFormat = "ascii" | "mermaid";
export type ModelDiagramView = "combined" | "schema" | "relationships";

export type ModelDiagramOptions = {
  format?: ModelDiagramFormat;
  view?: ModelDiagramView;
};

export type WriteDiagramFileOptions = ModelDiagramOptions & {
  markdown?: boolean;
  title?: string;
};

type FieldNode = {
  name: string;
  path: string;
  type: string;
  optional: boolean;
  nullable: boolean;
  children: FieldNode[];
};

type ZodDef = {
  type?: string;
  shape?: unknown;
  element?: unknown;
  innerType?: unknown;
  options?: unknown;
  values?: unknown;
  entries?: unknown;
};

type ZodLike = {
  _zod?: { def?: ZodDef };
  _def?: ZodDef;
};

/** Render a single model's schema and references as an ASCII or Mermaid diagram. */
export function renderModelDiagram(
  model: AnyModelDefinition,
  options: ModelDiagramOptions = {},
): string {
  return renderDbDiagram([model], options);
}

/** Render one or more models as an ASCII or Mermaid diagram. */
export function renderDbDiagram(
  models: readonly AnyModelDefinition[],
  options: ModelDiagramOptions = {},
): string {
  const format = options.format ?? "ascii";
  const view = options.view ?? "combined";

  return format === "mermaid"
    ? renderMermaidDiagram(models, view)
    : renderAsciiDiagram(models, view);
}

export async function writeModelDiagramFile(
  filePath: string,
  model: AnyModelDefinition,
  options: WriteDiagramFileOptions = {},
): Promise<string> {
  return writeDbDiagramFile(filePath, [model], options);
}

export async function writeDbDiagramFile(
  filePath: string,
  models: readonly AnyModelDefinition[],
  options: WriteDiagramFileOptions = {},
): Promise<string> {
  const content = formatDiagramFileContent(
    renderDbDiagram(models, options),
    filePath,
    options,
  );

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);

  return content;
}

function formatDiagramFileContent(
  diagram: string,
  filePath: string,
  options: WriteDiagramFileOptions,
): string {
  const markdown = options.markdown ?? isMarkdownPath(filePath);
  if (!markdown) {
    return `${diagram}\n`;
  }

  const title = options.title === undefined ? "" : `# ${options.title}\n\n`;
  const fence = options.format === "mermaid" ? "mermaid" : "txt";
  return `${title}\`\`\`${fence}\n${diagram}\n\`\`\`\n`;
}

function isMarkdownPath(filePath: string): boolean {
  return /\.(md|mdx)$/i.test(filePath);
}

function renderAsciiDiagram(
  models: readonly AnyModelDefinition[],
  view: ModelDiagramView,
): string {
  if (view === "relationships") {
    return renderAsciiRelationships(models);
  }

  return models
    .map((model) => renderAsciiModel(model, view))
    .join("\n\n");
}

function renderAsciiModel(model: AnyModelDefinition, view: ModelDiagramView): string {
  const fields = getModelFields(model);
  const referenceLabels = view === "schema" ? new Map<string, string>() : getReferenceLabels(model);
  const lines = [`${model.name} collection (${model.collectionName})`];
  const rootItems = getRootItems(model, fields);

  rootItems.forEach((item, index) => {
    const isLast = index === rootItems.length - 1;
    appendAsciiItem(lines, item, "", isLast, referenceLabels);
  });

  return lines.join("\n");
}

function getRootItems(
  model: AnyModelDefinition,
  fields: readonly FieldNode[],
): Array<FieldNode | string> {
  const primary = fields.find((field) => field.name === model.primaryKey);
  const items: Array<FieldNode | string> = [];

  if (primary === undefined) {
    items.push(`_id <- ${model.primaryKey}: unknown [primary]`);
  } else {
    items.push(`_id <- ${formatField(primary)} [primary]`);
  }

  for (const field of fields) {
    if (field.name !== model.primaryKey) {
      items.push(field);
    }
  }

  const indexLabels = model.indexes.map(formatIndex);
  for (const indexLabel of indexLabels) {
    items.push(`index ${indexLabel}`);
  }

  return items;
}

function appendAsciiItem(
  lines: string[],
  item: FieldNode | string,
  prefix: string,
  isLast: boolean,
  referenceLabels: ReadonlyMap<string, string>,
): void {
  const connector = isLast ? "└── " : "├── ";
  const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;

  if (typeof item === "string") {
    lines.push(`${prefix}${connector}${item}`);
    return;
  }

  const referenceLabel = referenceLabels.get(item.path);
  const suffix = referenceLabel === undefined ? "" : ` -> ${referenceLabel}`;
  lines.push(`${prefix}${connector}${formatField(item)}${suffix}`);

  item.children.forEach((child, index) => {
    appendAsciiItem(
      lines,
      child,
      nextPrefix,
      index === item.children.length - 1,
      referenceLabels,
    );
  });
}

function renderAsciiRelationships(models: readonly AnyModelDefinition[]): string {
  const relationships = models.flatMap((model) =>
    model.references.map(
      (reference) =>
        `${model.name}.${reference.path} -> ${reference.target.name}.${reference.target.primaryKey}`,
    ),
  );

  return relationships.length === 0 ? "No model references." : relationships.join("\n");
}

function renderMermaidDiagram(
  models: readonly AnyModelDefinition[],
  view: ModelDiagramView,
): string {
  const lines = ["flowchart TD"];

  if (view === "relationships") {
    appendMermaidRelationships(lines, models);
    return lines.join("\n");
  }

  for (const model of models) {
    const rootId = mermaidId(model.name, "collection");
    lines.push(`  ${rootId}[${mermaidLabel(`${model.name} (${model.collectionName})`)}]`);

    const fields = getModelFields(model);
    const primary = fields.find((field) => field.name === model.primaryKey);
    if (primary === undefined) {
      const primaryId = mermaidId(model.name, "_id");
      lines.push(`  ${primaryId}[${mermaidLabel(`_id <- ${model.primaryKey}: unknown [primary]`)}]`);
      lines.push(`  ${rootId} --> ${primaryId}`);
    } else {
      const primaryId = mermaidId(model.name, "_id");
      lines.push(`  ${primaryId}[${mermaidLabel(`_id <- ${formatField(primary)} [primary]`)}]`);
      lines.push(`  ${rootId} --> ${primaryId}`);
    }

    for (const field of fields) {
      if (field.name !== model.primaryKey) {
        appendMermaidField(lines, model, rootId, field);
      }
    }

    for (const index of model.indexes) {
      const indexName = toDeclaredIndex(index).name;
      const indexId = mermaidId(model.name, `index_${indexName}`);
      lines.push(`  ${indexId}[${mermaidLabel(`index ${formatIndex(index)}`)}]`);
      lines.push(`  ${rootId} -.-> ${indexId}`);
    }
  }

  if (view === "combined") {
    appendMermaidReferenceEdges(lines, models);
  }

  return lines.join("\n");
}

function appendMermaidField(
  lines: string[],
  model: AnyModelDefinition,
  parentId: string,
  field: FieldNode,
): void {
  const fieldId = mermaidId(model.name, field.path);
  lines.push(`  ${fieldId}[${mermaidLabel(formatField(field))}]`);
  lines.push(`  ${parentId} --> ${fieldId}`);

  for (const child of field.children) {
    appendMermaidField(lines, model, fieldId, child);
  }
}

function appendMermaidRelationships(
  lines: string[],
  models: readonly AnyModelDefinition[],
): void {
  for (const model of models) {
    lines.push(`  ${mermaidId(model.name, "model")}[${mermaidLabel(model.name)}]`);
  }

  for (const model of models) {
    for (const reference of model.references) {
      lines.push(
        `  ${mermaidId(model.name, "model")} -->|${mermaidEdgeLabel(reference.path)}| ${mermaidId(reference.target.name, "model")}`,
      );
    }
  }
}

function appendMermaidReferenceEdges(
  lines: string[],
  models: readonly AnyModelDefinition[],
): void {
  for (const model of models) {
    for (const reference of model.references) {
      lines.push(
        `  ${mermaidId(model.name, reference.path)} -.->|${mermaidEdgeLabel(`${reference.target.name}.${reference.target.primaryKey}`)}| ${mermaidId(reference.target.name, "_id")}`,
      );
    }
  }
}

function getModelFields(model: AnyModelDefinition): FieldNode[] {
  const schema = unwrapSchema(model.schema).schema;
  const def = getZodDef(schema, "diagram rendering");
  if (def.type !== "object") {
    throw new Error(
      `Zog diagram rendering requires ${model.name} to use a Zod 4 object schema.`,
    );
  }

  return Object.entries(getObjectShape(def)).map(([name, fieldSchema]) =>
    buildFieldNode(name, name, fieldSchema),
  );
}

function buildFieldNode(name: string, path: string, schema: unknown): FieldNode {
  const unwrapped = unwrapSchema(schema);
  const def = getZodDef(unwrapped.schema, path);

  if (def.type === "array" && def.element !== undefined) {
    const element = unwrapSchema(def.element);
    const elementDef = getZodDef(element.schema, `${path}[]`);
    const arrayPath = `${path}[]`;

    return {
      name,
      path: arrayPath,
      type:
        elementDef.type === "object"
          ? "object[]"
          : `${formatSchemaType(element.schema)}[]`,
      optional: unwrapped.optional,
      nullable: unwrapped.nullable,
      children:
        elementDef.type === "object"
          ? Object.entries(getObjectShape(elementDef)).map(([childName, childSchema]) =>
              buildFieldNode(childName, `${arrayPath}.${childName}`, childSchema),
            )
          : [],
    };
  }

  return {
    name,
    path,
    type: formatSchemaType(unwrapped.schema),
    optional: unwrapped.optional,
    nullable: unwrapped.nullable,
    children:
      def.type === "object"
        ? Object.entries(getObjectShape(def)).map(([childName, childSchema]) =>
            buildFieldNode(childName, `${path}.${childName}`, childSchema),
          )
        : [],
  };
}

function getReferenceLabels(model: AnyModelDefinition): Map<string, string> {
  return new Map(
    model.references.map((reference) => [
      reference.path,
      `${reference.target.name}.${reference.target.primaryKey}`,
    ]),
  );
}

function formatField(field: FieldNode): string {
  const optional = field.optional ? "?" : "";
  const nullable = field.nullable ? " | null" : "";
  return `${field.name}${optional}: ${field.type}${nullable}`;
}

function formatIndex(index: AnyModelDefinition["indexes"][number]): string {
  const declared = toDeclaredIndex(index);
  const unique = declared.description.unique === true ? " unique" : "";
  return `${declared.name}${unique} (${formatIndexKey(declared.description.key)})`;
}

function formatIndexKey(key: unknown): string {
  const entries =
    key instanceof Map
      ? Array.from(key.entries())
      : typeof key === "object" && key !== null
        ? Object.entries(key)
        : [];

  return entries.map(([field, direction]) => `${field}: ${String(direction)}`).join(", ");
}

function unwrapSchema(schema: unknown): {
  schema: unknown;
  optional: boolean;
  nullable: boolean;
} {
  let current = schema;
  let optional = false;
  let nullable = false;

  for (;;) {
    const def = getZodDef(current, "diagram rendering");
    if (def.type === "optional" || def.type === "default" || def.type === "catch") {
      optional = true;
      current = def.innerType;
      continue;
    }

    if (def.type === "nullable") {
      nullable = true;
      current = def.innerType;
      continue;
    }

    return { schema: current, optional, nullable };
  }
}

function formatSchemaType(schema: unknown): string {
  const def = getZodDef(schema, "diagram rendering");

  if (
    def.type === "string" ||
    def.type === "number" ||
    def.type === "boolean" ||
    def.type === "bigint" ||
    def.type === "date" ||
    def.type === "object"
  ) {
    return def.type;
  }

  if (def.type === "enum") {
    return Object.keys(toRecord(def.entries))
      .map((value) => JSON.stringify(value))
      .join(" | ");
  }

  if (def.type === "literal") {
    const values = Array.isArray(def.values) ? def.values : [];
    return values.map((value) => JSON.stringify(value)).join(" | ");
  }

  if (def.type === "union" && Array.isArray(def.options)) {
    return def.options.map((option) => formatSchemaType(unwrapSchema(option).schema)).join(" | ");
  }

  return def.type ?? "unknown";
}

function getZodDef(schema: unknown, feature: string): ZodDef {
  const candidate = schema as ZodLike;
  const def = candidate._zod?.def ?? candidate._def;
  if (def === undefined) {
    throw new Error(
      `Zog ${feature} requires Zod 4 schemas because this feature introspects schema internals.`,
    );
  }

  return def;
}

function getObjectShape(def: ZodDef): Record<string, unknown> {
  const shape = typeof def.shape === "function" ? def.shape() : def.shape;
  if (typeof shape === "object" && shape !== null && !Array.isArray(shape)) {
    return shape as Record<string, unknown>;
  }

  return {};
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function mermaidId(modelName: string, path: string): string {
  return `zog_${modelName}_${path}`.replace(/[^A-Za-z0-9_]/g, "_");
}

function mermaidLabel(label: string): string {
  return JSON.stringify(label);
}

function mermaidEdgeLabel(label: string): string {
  return label.replace(/[|]/g, "/");
}
