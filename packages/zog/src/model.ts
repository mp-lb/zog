import type { Collection, Document } from "mongodb";
import type { ModelIndex } from "./indexes.js";
import type { ModelReference } from "./references.js";
import { validateModelReferences } from "./references.js";

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

export type TimestampOptions<Output> = {
  createdAt: Extract<keyof Output, string>;
  updatedAt: Extract<keyof Output, string>;
  now: () => unknown;
};

export type TimestampRuntimeOptions = {
  createdAt: string;
  updatedAt: string;
  now: () => unknown;
};

export type LegacyKeyRename = {
  from: string;
  to: string;
};

export type ModelOptions<
  Schema extends ZogSchema,
  PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
> = {
  primaryKey: PrimaryKey;
  collectionName?: string;
  legacyCollectionNames?: readonly string[];
  legacyKeyRenames?: readonly LegacyKeyRename[];
  references?: readonly ModelReference[];
  indexes?: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy?: ObjectIdPolicy;
  timestamps?: TimestampOptions<SchemaOutput<Schema>>;
};

export type ModelDefinition<
  Name extends string,
  Schema extends ZogSchema,
  PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
> = {
  name: Name;
  collectionName: string;
  legacyCollectionNames: readonly string[];
  legacyKeyRenames: readonly LegacyKeyRename[];
  references: readonly ModelReference[];
  schema: Schema;
  primaryKey: PrimaryKey;
  indexes: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy: ObjectIdPolicy;
  timestamps?: TimestampOptions<SchemaOutput<Schema>>;
};

export type AnyModelDefinition = {
  name: string;
  collectionName: string;
  legacyCollectionNames: readonly string[];
  legacyKeyRenames: readonly LegacyKeyRename[];
  references: readonly ModelReference[];
  schema: ZogSchema;
  primaryKey: string;
  indexes: readonly ModelIndex[];
  normalizeLegacy?: (raw: Record<string, unknown>) => Record<string, unknown>;
  beforeEnsureIndexes?: (collection: Collection<Document>) => Promise<void> | void;
  objectIdPolicy: ObjectIdPolicy;
  timestamps?: TimestampRuntimeOptions;
};

export type InferModel<Model extends AnyModelDefinition> =
  Model extends { schema: infer Schema extends ZogSchema } ? SchemaOutput<Schema> & object : never;

/**
 * Define a Zog model: a Zod schema plus the metadata Zog needs to persist it
 * (primary key, collection name, indexes, references, timestamps).
 *
 * @example
 * ```ts
 * const userModel = createModel("users", userSchema, { primaryKey: "id" });
 * ```
 */
export function createModel<
  const Name extends string,
  Schema extends ZogSchema,
  const PrimaryKey extends Extract<keyof SchemaOutput<Schema>, string>,
  const Options extends ModelOptions<Schema, PrimaryKey>,
>(
  name: Name,
  schema: Schema,
  options: Options,
): ModelDefinition<Name, Schema, PrimaryKey> &
  (Options extends { timestamps: infer Timestamps extends TimestampOptions<SchemaOutput<Schema>> }
    ? { timestamps: Timestamps }
    : object) {
  const definition = {
    name,
    collectionName: options.collectionName ?? name,
    legacyCollectionNames: options.legacyCollectionNames ?? [],
    legacyKeyRenames: options.legacyKeyRenames ?? [],
    references: options.references ?? [],
    schema,
    primaryKey: options.primaryKey,
    indexes: options.indexes ?? [],
    objectIdPolicy: options.objectIdPolicy ?? "reject",
  };

  const model = {
    ...definition,
    ...(options.normalizeLegacy === undefined
      ? {}
      : { normalizeLegacy: options.normalizeLegacy }),
    ...(options.beforeEnsureIndexes === undefined
      ? {}
      : { beforeEnsureIndexes: options.beforeEnsureIndexes }),
    ...(options.timestamps === undefined ? {} : { timestamps: options.timestamps }),
  } as ModelDefinition<Name, Schema, PrimaryKey> &
    (Options extends {
      timestamps: infer Timestamps extends TimestampOptions<SchemaOutput<Schema>>;
    }
      ? { timestamps: Timestamps }
      : object);

  validateModelReferences(model);

  return model;
}
