import type { Collection, Document } from "mongodb";
import type { ModelIndex } from "./indexes.js";

export type ObjectIdPolicy = "reject" | "stringify";

export type ZogSchema<Output = unknown> = {
  parse(input: unknown): Output;
};

export type SchemaOutput<Schema> = Schema extends {
  parse(input: unknown): infer Output;
}
  ? Output
  : never;

export type SchemaInput<Schema> = Schema extends { _input: infer Input }
  ? Input
  : SchemaOutput<Schema>;

export type ModelOptions<
  Schema extends ZogSchema,
  PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
> = {
  primaryKey: PrimaryKey;
  collectionName?: string;
  indexes?: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy?: ObjectIdPolicy;
};

export type ModelDefinition<
  Name extends string,
  Schema extends ZogSchema,
  PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
> = {
  name: Name;
  collectionName: string;
  schema: Schema;
  primaryKey: PrimaryKey;
  indexes: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy: ObjectIdPolicy;
};

export type AnyModelDefinition = {
  name: string;
  collectionName: string;
  schema: ZogSchema;
  primaryKey: string;
  indexes: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy: ObjectIdPolicy;
};

export type InferModel<Model extends AnyModelDefinition> =
  Model extends { schema: infer Schema extends ZogSchema } ? SchemaOutput<Schema> & object : never;

export function createModel<
  const Name extends string,
  Schema extends ZogSchema,
  const PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
>(
  name: Name,
  schema: Schema,
  options: ModelOptions<Schema, PrimaryKey>,
): ModelDefinition<Name, Schema, PrimaryKey> {
  const definition = {
    name,
    collectionName: options.collectionName ?? name,
    schema,
    primaryKey: options.primaryKey,
    indexes: options.indexes ?? [],
    objectIdPolicy: options.objectIdPolicy ?? "reject",
  };

  return {
    ...definition,
    ...(options.normalizeLegacy === undefined
      ? {}
      : { normalizeLegacy: options.normalizeLegacy }),
    ...(options.beforeEnsureIndexes === undefined
      ? {}
      : { beforeEnsureIndexes: options.beforeEnsureIndexes }),
  };
}
