import type { AnyModelDefinition, ZogSchema } from "./model.js";

export type ModelReferenceOptions = {
  optional?: boolean;
  nullable?: boolean;
};

export type ModelReference<TargetModel extends AnyModelDefinition = AnyModelDefinition> = {
  path: string;
  target: TargetModel;
  optional: boolean;
  nullable: boolean;
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

type ReferenceType =
  | "string"
  | "number"
  | "boolean"
  | "bigint"
  | "date"
  | "unknown";

type ResolvedSchemaPath = {
  path: string;
  type: ReferenceType;
  optional: boolean;
  nullable: boolean;
};

type PathSegment = {
  key: string;
  array: boolean;
};

/**
 * Declare that a field holds another model's primary key. The reference is
 * checked against the Zod schemas when the model is created; it does not enforce
 * referential integrity in MongoDB at read or write time.
 *
 * @example
 * ```ts
 * createModel("posts", postSchema, {
 *   primaryKey: "id",
 *   references: [ref("authorId", userModel)],
 * });
 * ```
 */
export function ref<TargetModel extends AnyModelDefinition>(
  path: string,
  target: TargetModel,
  options: ModelReferenceOptions = {},
): ModelReference<TargetModel> {
  return {
    path,
    target,
    optional: options.optional ?? false,
    nullable: options.nullable ?? false,
  };
}

export function validateModelReferences(
  model: Pick<AnyModelDefinition, "name" | "schema" | "references">,
): void {
  for (const reference of model.references) {
    validateModelReference(model, reference);
  }
}

function validateModelReference(
  model: Pick<AnyModelDefinition, "name" | "schema">,
  reference: ModelReference,
): void {
  const source = resolveSchemaPath(model.schema, reference.path);
  const target = resolveSchemaPath(reference.target.schema, reference.target.primaryKey);
  const prefix = `Invalid reference ${model.name}.${reference.path} -> ${reference.target.name}.${reference.target.primaryKey}`;

  if (source.optional && !reference.optional) {
    throw new Error(
      `${prefix}: ${model.name}.${reference.path} is optional, but references are required by default. Pass { optional: true } to ref(...) if this is intentional.`,
    );
  }

  if (source.nullable && !reference.nullable) {
    throw new Error(
      `${prefix}: ${model.name}.${reference.path} is nullable, but references are non-null by default. Pass { nullable: true } to ref(...) if this is intentional.`,
    );
  }

  if (target.optional) {
    throw new Error(
      `${prefix}: target primary key ${reference.target.name}.${reference.target.primaryKey} is optional.`,
    );
  }

  if (target.nullable) {
    throw new Error(
      `${prefix}: target primary key ${reference.target.name}.${reference.target.primaryKey} is nullable.`,
    );
  }

  if (source.type === "unknown") {
    throw new Error(
      `${prefix}: ${model.name}.${reference.path} has a schema type Zog cannot compare as a reference.`,
    );
  }

  if (target.type === "unknown") {
    throw new Error(
      `${prefix}: ${reference.target.name}.${reference.target.primaryKey} has a schema type Zog cannot compare as a primary key.`,
    );
  }

  if (source.type !== target.type) {
    throw new Error(
      `${prefix}: type mismatch, ${model.name}.${reference.path} is ${source.type} but ${reference.target.name}.${reference.target.primaryKey} is ${target.type}.`,
    );
  }
}

function resolveSchemaPath(schema: ZogSchema, path: string): ResolvedSchemaPath {
  assertZod4Schema(schema, path);

  let current: unknown = schema;
  let optional = false;
  let nullable = false;

  for (const segment of parsePath(path)) {
    const unwrapped = unwrapSchema(current);
    current = unwrapped.schema;
    optional = optional || unwrapped.optional;
    nullable = nullable || unwrapped.nullable;

    const objectDef = getZodDef(current);
    if (objectDef.type !== "object") {
      throw new Error(
        `Invalid schema path ${path}: cannot read ${segment.key} from ${describeZodType(objectDef)}.`,
      );
    }

    const shape = getObjectShape(objectDef);
    const next = shape[segment.key];
    if (next === undefined) {
      throw new Error(`Invalid schema path ${path}: ${segment.key} does not exist.`);
    }

    const child = unwrapSchema(next);
    current = child.schema;
    optional = optional || child.optional;
    nullable = nullable || child.nullable;

    if (segment.array) {
      const arrayDef = getZodDef(current);
      if (arrayDef.type !== "array" || arrayDef.element === undefined) {
        throw new Error(`Invalid schema path ${path}: ${segment.key} is not an array.`);
      }

      const element = unwrapSchema(arrayDef.element);
      current = element.schema;
      optional = optional || element.optional;
      nullable = nullable || element.nullable;
    }
  }

  const resolved = unwrapSchema(current);
  return {
    path,
    type: getReferenceType(resolved.schema),
    optional: optional || resolved.optional,
    nullable: nullable || resolved.nullable,
  };
}

function parsePath(path: string): PathSegment[] {
  if (path.trim() === "") {
    throw new Error("Invalid schema path: path cannot be empty.");
  }

  return path.split(".").map((segment) => {
    if (segment === "" || segment === "[]") {
      throw new Error(`Invalid schema path ${path}: path segments cannot be empty.`);
    }

    const array = segment.endsWith("[]");
    const key = array ? segment.slice(0, -2) : segment;
    if (key === "") {
      throw new Error(`Invalid schema path ${path}: array segments need a field name.`);
    }

    return { key, array };
  });
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
    const def = getZodDef(current);
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

function getReferenceType(schema: unknown): ReferenceType {
  const def = getZodDef(schema);

  if (
    def.type === "string" ||
    def.type === "number" ||
    def.type === "boolean" ||
    def.type === "bigint" ||
    def.type === "date"
  ) {
    return def.type;
  }

  if (def.type === "enum") {
    return "string";
  }

  if (def.type === "literal") {
    const values = Array.isArray(def.values) ? def.values : [];
    const valueTypes = new Set(values.map((value) => typeof value));
    return valueTypes.size === 1 ? primitiveTypeFromTypeof(values[0]) : "unknown";
  }

  if (def.type === "union" && Array.isArray(def.options)) {
    const optionTypes = def.options.map((option) => getReferenceType(option));
    const uniqueTypes = new Set(optionTypes);
    return uniqueTypes.size === 1 && optionTypes[0] !== undefined
      ? optionTypes[0]
      : "unknown";
  }

  return "unknown";
}

function primitiveTypeFromTypeof(value: unknown): ReferenceType {
  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "bigint"
  ) {
    return valueType;
  }

  return "unknown";
}

function assertZod4Schema(schema: ZogSchema, path: string): void {
  const candidate = schema as ZodLike;
  if (candidate._zod?.def === undefined) {
    throw new Error(
      `Zog references require Zod 4 schemas because this feature introspects schema internals. Upgrade to Zod 4 or remove the reference for ${path}.`,
    );
  }
}

function getZodDef(schema: unknown): ZodDef {
  const candidate = schema as ZodLike;
  const def = candidate._zod?.def ?? candidate._def;
  if (def === undefined) {
    throw new Error(
      "Zog references require Zod 4 schemas because this feature introspects schema internals.",
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

function describeZodType(def: ZodDef): string {
  return def.type === undefined ? "an unknown schema type" : `${def.type}`;
}
