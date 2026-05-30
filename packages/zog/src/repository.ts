import {
  ObjectId,
  type Abortable,
  type AnyBulkWriteOperation,
  type BulkWriteOptions,
  type BulkWriteResult,
  type ClientSession,
  type Collection,
  type Db,
  type DeleteOptions,
  type DeleteResult,
  type Document,
  type Filter as MongoFilter,
  type FindCursor,
  type FindOneAndDeleteOptions,
  type FindOneAndReplaceOptions,
  type FindOneAndUpdateOptions,
  type FindOneOptions as MongoFindOneOptions,
  type FindOptions as MongoFindOptions,
  type InsertManyResult,
  type InsertOneOptions,
  type InsertOneResult,
  type MongoClient,
  type OptionalUnlessRequiredId,
  type ReplaceOptions,
  type Sort,
  type SortDirection,
  type TransactionOptions,
  type UpdateFilter,
  type UpdateOptions,
  type UpdateResult,
} from "mongodb";
import { ZogError, isValidationError, type ZogOperation } from "./error.js";
import {
  indexSpecsMatch,
  toDeclaredIndex,
  toIndexDescription,
  type DbIndexDiff,
  type ExistingIndex,
  type ModelIndexDiff,
} from "./indexes.js";
import type {
  AnyModelDefinition,
  InferModel,
  LegacyKeyRename,
  SchemaInput,
  ZogSchema,
} from "./model.js";

export type Filter<T extends object> = MongoFilter<T & Document>;
export type FindOptions<T extends object> = MongoFindOptions<T & Document>;
export type FindOneOptions = Omit<MongoFindOneOptions, "timeoutMode"> & Abortable;
export type ParsedFindOneAndUpdateOptions = Omit<
  FindOneAndUpdateOptions,
  "includeResultMetadata"
> & { includeResultMetadata?: false };
export type ParsedFindOneAndReplaceOptions = Omit<
  FindOneAndReplaceOptions,
  "includeResultMetadata"
> & { includeResultMetadata?: false };
export type ParsedFindOneAndDeleteOptions = Omit<
  FindOneAndDeleteOptions,
  "includeResultMetadata"
> & { includeResultMetadata?: false };

export type ParsedFindCursor<T extends object> = {
  readonly raw: FindCursor<Document>;
  toArray(): Promise<T[]>;
  next(): Promise<T | null>;
  tryNext(): Promise<T | null>;
  forEach(iterator: (doc: T) => boolean | void | Promise<boolean | void>): Promise<void>;
  sort(sort: Sort | string, direction?: SortDirection): ParsedFindCursor<T>;
  limit(value: number): ParsedFindCursor<T>;
  skip(value: number): ParsedFindCursor<T>;
  project(value: Document): ParsedFindCursor<T>;
  [Symbol.asyncIterator](): AsyncGenerator<T, void, void>;
};

export type Repository<TOutput extends object, TInput = TOutput> = {
  readonly raw: Collection<Document>;
  find(filter?: Filter<TOutput>, options?: FindOptions<TOutput>): ParsedFindCursor<TOutput>;
  findById(id: string, options?: FindOneOptions): Promise<TOutput | null>;
  findOne(filter?: Filter<TOutput>, options?: FindOneOptions): Promise<TOutput | null>;
  findMany(filter: Filter<TOutput>, options?: FindOptions<TOutput>): Promise<TOutput[]>;
  insertOne(value: TInput, options?: InsertOneOptions): Promise<InsertOneResult<Document>>;
  insertMany(
    values: readonly TInput[],
    options?: BulkWriteOptions,
  ): Promise<InsertManyResult<Document>>;
  replaceOne(
    filter: Filter<TOutput>,
    value: TInput,
    options?: ReplaceOptions,
  ): Promise<UpdateResult<Document>>;
  updateOne(
    filter: Filter<TOutput>,
    update: UpdateFilter<TOutput & Document> | Document[],
    options?: UpdateOptions & { sort?: Sort },
  ): Promise<UpdateResult<Document>>;
  updateMany(
    filter: Filter<TOutput>,
    update: UpdateFilter<TOutput & Document> | Document[],
    options?: UpdateOptions,
  ): Promise<UpdateResult<Document>>;
  findOneAndUpdate(
    filter: Filter<TOutput>,
    update: UpdateFilter<TOutput & Document> | Document[],
    options?: ParsedFindOneAndUpdateOptions,
  ): Promise<TOutput | null>;
  findOneAndReplace(
    filter: Filter<TOutput>,
    value: TInput,
    options?: ParsedFindOneAndReplaceOptions,
  ): Promise<TOutput | null>;
  findOneAndDelete(
    filter: Filter<TOutput>,
    options?: ParsedFindOneAndDeleteOptions,
  ): Promise<TOutput | null>;
  deleteOne(filter?: Filter<TOutput>, options?: DeleteOptions): Promise<DeleteResult>;
  deleteMany(filter?: Filter<TOutput>, options?: DeleteOptions): Promise<DeleteResult>;
  bulkWrite(
    operations: ReadonlyArray<AnyBulkWriteOperation<Document>>,
    options?: BulkWriteOptions,
  ): Promise<BulkWriteResult>;
  insert(value: TInput): Promise<TOutput>;
  replace(value: TInput): Promise<TOutput>;
  setById(id: string, patch: Partial<TOutput>): Promise<TOutput | null>;
  updateById(id: string, patch: Partial<TOutput>): Promise<TOutput | null>;
  deleteById(id: string): Promise<void>;
};

type TimestampFieldNames<Model extends AnyModelDefinition> =
  Model extends { timestamps: infer Timestamps }
    ? Timestamps extends {
        createdAt: infer CreatedAt extends string;
        updatedAt: infer UpdatedAt extends string;
      }
      ? CreatedAt | UpdatedAt
      : never
    : never;

type OptionalTimestampInput<Input, Keys extends string> =
  Input extends object
    ? Omit<Input, Extract<Keys, keyof Input>> &
        Partial<Pick<Input, Extract<Keys, keyof Input>>>
    : Input;

export type ModelWriteInput<Model extends AnyModelDefinition> = OptionalTimestampInput<
  SchemaInput<Model["schema"]>,
  TimestampFieldNames<Model>
>;

type ModelRuntime<T extends object> = {
  modelName: string;
  collectionName: string;
  primaryKey: string;
  schema: ZogSchema<T>;
  legacyKeyRenames?: readonly LegacyKeyRename[];
  normalizeLegacy: ((raw: Record<string, unknown>) => Record<string, unknown>) | undefined;
  objectIdPolicy: "reject" | "stringify";
  timestamps?: {
    createdAt: string;
    updatedAt: string;
    now: () => unknown;
  };
};

export type MongoDocument<T extends object = object> = Partial<T> & {
  _id: unknown;
};

export function toMongo<T extends object>(
  model: ModelRuntime<T>,
  value: T,
): MongoDocument<T> {
  const primaryValue = (value as Record<string, unknown>)[model.primaryKey];

  if (typeof primaryValue !== "string" || primaryValue.trim() === "") {
    throw new ZogError({
      modelName: model.modelName,
      collectionName: model.collectionName,
      operation: "replace",
      details: `primary key ${model.primaryKey} must be a non-empty string`,
    });
  }

  const document: Record<string, unknown> = {
    ...value,
    _id: primaryValue,
  };

  if (model.primaryKey !== "_id") {
    delete document[model.primaryKey];
  }

  return document as MongoDocument<T>;
}

export function fromMongo<T extends object>(
  model: ModelRuntime<T>,
  raw: Document | null,
): Record<string, unknown> | null {
  if (raw === null) {
    return null;
  }

  const candidate = { ...raw };
  applyLegacyKeyRenames(candidate, model.legacyKeyRenames ?? []);

  const normalized = model.normalizeLegacy
    ? model.normalizeLegacy(candidate)
    : candidate;

  const mongoId = normalized._id;
  const primaryValue = normalized[model.primaryKey];

  if (primaryValue === undefined) {
    const normalizedMongoId = normalizeMongoId(model, mongoId);
    normalized[model.primaryKey] = normalizedMongoId;
  } else if (model.primaryKey === "_id") {
    normalized[model.primaryKey] = normalizeMongoId(model, primaryValue);
  }

  if (model.primaryKey !== "_id") {
    delete normalized._id;
  }

  return normalized;
}

type LegacyPathSegment = {
  key: string;
  array: boolean;
};

function applyLegacyKeyRenames(
  target: Record<string, unknown>,
  renames: readonly LegacyKeyRename[],
): void {
  for (const rename of renames) {
    applyLegacyKeyRename(target, rename);
  }
}

function applyLegacyKeyRename(
  target: Record<string, unknown>,
  rename: LegacyKeyRename,
): void {
  const from = parseLegacyPath(rename.from);
  const to = parseLegacyPath(rename.to);

  assertCompatibleLegacyRename(rename, from, to);
  applyLegacyKeyRenameAtParent(target, from, to);
}

function parseLegacyPath(path: string): LegacyPathSegment[] {
  if (path.trim() === "") {
    throw new Error("legacy key rename paths must be non-empty");
  }

  return path.split(".").map((segment) => {
    const array = segment.endsWith("[]");
    const key = array ? segment.slice(0, -2) : segment;

    if (key === "" || key.includes("[") || key.includes("]")) {
      throw new Error(`invalid legacy key rename path ${JSON.stringify(path)}`);
    }

    return { key, array };
  });
}

function assertCompatibleLegacyRename(
  rename: LegacyKeyRename,
  from: readonly LegacyPathSegment[],
  to: readonly LegacyPathSegment[],
): void {
  if (from.length !== to.length) {
    throw new Error(
      `legacy key rename ${JSON.stringify(rename.from)} -> ${JSON.stringify(
        rename.to,
      )} must keep the same parent path`,
    );
  }

  const fromKey = from[from.length - 1];
  const toKey = to[to.length - 1];
  if (!fromKey || !toKey || fromKey.array || toKey.array || fromKey.key === toKey.key) {
    throw new Error(
      `legacy key rename ${JSON.stringify(rename.from)} -> ${JSON.stringify(
        rename.to,
      )} must rename one object key`,
    );
  }

  for (let index = 0; index < from.length - 1; index += 1) {
    const fromSegment = from[index];
    const toSegment = to[index];

    if (
      !fromSegment ||
      !toSegment ||
      fromSegment.key !== toSegment.key ||
      fromSegment.array !== toSegment.array
    ) {
      throw new Error(
        `legacy key rename ${JSON.stringify(rename.from)} -> ${JSON.stringify(
          rename.to,
        )} must keep the same parent path`,
      );
    }
  }
}

function applyLegacyKeyRenameAtParent(
  current: unknown,
  from: readonly LegacyPathSegment[],
  to: readonly LegacyPathSegment[],
): void {
  if (!isRecord(current)) {
    return;
  }

  if (from.length === 1) {
    const fromSegment = from[0];
    const toSegment = to[0];

    if (!fromSegment || !toSegment) {
      return;
    }

    const fromKey = fromSegment.key;
    const toKey = toSegment.key;

    if (Object.prototype.hasOwnProperty.call(current, fromKey)) {
      if (!Object.prototype.hasOwnProperty.call(current, toKey)) {
        current[toKey] = current[fromKey];
      }

      delete current[fromKey];
    }

    return;
  }

  const [segment, ...remainingFrom] = from;
  if (!segment) {
    return;
  }

  const remainingTo = to.slice(1);
  const next = current[segment.key];

  if (segment.array) {
    if (!Array.isArray(next)) {
      return;
    }

    const cloned = next.map((item) => (isRecord(item) ? { ...item } : item));
    current[segment.key] = cloned;

    for (const item of cloned) {
      applyLegacyKeyRenameAtParent(item, remainingFrom, remainingTo);
    }

    return;
  }

  if (!isRecord(next)) {
    return;
  }

  const cloned = { ...next };
  current[segment.key] = cloned;
  applyLegacyKeyRenameAtParent(cloned, remainingFrom, remainingTo);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMongoZodCollection<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: CreateMongoZodCollectionOptions = {},
): Repository<InferModel<Model>, ModelWriteInput<Model>> {
  type T = InferModel<Model>;
  type Input = ModelWriteInput<Model>;

  const collectionName = options.collectionName ?? model.collectionName;
  assertCollectionNamePolicy({
    modelName: model.name,
    collectionName,
    policy: options.collectionNamePolicy ?? null,
    operation: "defineDb",
  });
  const canonicalCollection = db.collection(collectionName) as Collection<Document>;
  const session = options.session;
  const collectionNameCompatibility = options.collectionNameCompatibility ?? "off";
  const legacyCollectionNames =
    collectionName === model.collectionName ? model.legacyCollectionNames : [];
  const runtime: ModelRuntime<T> = {
    modelName: model.name,
    collectionName,
    primaryKey: model.primaryKey,
    schema: model.schema as ZogSchema<T>,
    legacyKeyRenames: model.legacyKeyRenames,
    normalizeLegacy: model.normalizeLegacy,
    objectIdPolicy: model.objectIdPolicy,
    ...(model.timestamps === undefined ? {} : { timestamps: model.timestamps }),
  };

  function parseReadDocument(raw: Document | null, operation: ZogOperation): T | null {
    try {
      const candidate = fromMongo(runtime, raw);
      return candidate === null ? null : runtime.schema.parse(candidate);
    } catch (cause) {
      throw wrapError(runtime, operation, cause);
    }
  }

  async function parseRead(raw: Document | null, operation: ZogOperation): Promise<T | null> {
    return parseReadDocument(raw, operation);
  }

  async function resolveCollection(operation: ZogOperation): Promise<Collection<Document>> {
    const resolvedCollectionName = await resolveCollectionNameCompatibility(db, {
      modelName: model.name,
      collectionName,
      legacyCollectionNames,
      collectionNameCompatibility,
      operation,
    });
    return db.collection(resolvedCollectionName) as Collection<Document>;
  }

  function parseWrite(
    value: Input,
    operation: ZogOperation,
    timestampMode: TimestampMode,
  ): MongoDocument<T> {
    try {
      const parsed = runtime.schema.parse(applyWriteTimestamps(runtime, value, timestampMode));
      return toMongo(runtime, parsed);
    } catch (cause) {
      throw wrapError(runtime, operation, cause);
    }
  }

  return {
    raw: canonicalCollection,

    find(filter = {}, options) {
      return createDeferredParsedCursor(
        async () => {
          const collection = await resolveCollection("findMany");
          return collection.find(
            toMongoFilter(runtime, filter),
            withSession(session, options) as MongoFindOptions<Document>,
          );
        },
        (raw) => parseReadDocument(raw, "findMany"),
      );
    },

    async findById(id, options) {
      const collection = await resolveCollection("findById");
      const raw =
        (await collection.findOne(
          { _id: id } as unknown as MongoFilter<Document>,
          withSession(session, options) as MongoFindOneOptions,
        )) ?? (await findLegacyDocumentByPrimaryKey(collection, id, options));
      return parseRead(raw, "findById");
    },

    async findOne(filter = {}, options) {
      const collection = await resolveCollection("findOne");
      const raw = await collection.findOne(
        toMongoFilter(runtime, filter),
        withSession(session, options) as MongoFindOneOptions,
      );
      return parseRead(raw, "findOne");
    },

    async findMany(filter, options) {
      try {
        const collection = await resolveCollection("findMany");
        const rawDocuments = await collection
          .find(
            toMongoFilter(runtime, filter),
            withSession(session, options) as MongoFindOptions<Document>,
          )
          .toArray();

        return rawDocuments.map((raw) => {
          const candidate = fromMongo(runtime, raw);
          if (candidate === null) {
            throw new Error("Unexpected null document");
          }
          return runtime.schema.parse(candidate);
        });
      } catch (cause) {
        throw wrapError(runtime, "findMany", cause);
      }
    },

    async insertOne(value, options) {
      const document = parseWrite(value, "insert", "insert");

      try {
        const collection = await resolveCollection("insert");
        return await collection.insertOne(
          document as OptionalUnlessRequiredId<Document>,
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "insert", cause);
      }
    },

    async insertMany(values, options) {
      const documents = values.map((value) => parseWrite(value, "insert", "insert"));

      try {
        const collection = await resolveCollection("insert");
        return await collection.insertMany(
          documents as OptionalUnlessRequiredId<Document>[],
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "insert", cause);
      }
    },

    async replaceOne(filter, value, options) {
      const document = parseWrite(value, "replace", "update");

      try {
        const collection = await resolveCollection("replace");
        return await collection.replaceOne(
          toMongoFilter(runtime, filter),
          document,
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async updateOne(filter, update, options) {
      try {
        const collection = await resolveCollection("update");
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        return await collection.updateOne(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, withUpdateTimestamp(runtime, update)),
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async updateMany(filter, update, options) {
      try {
        const collection = await resolveCollection("update");
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        return await collection.updateMany(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, withUpdateTimestamp(runtime, update)),
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async findOneAndUpdate(filter, update, options) {
      try {
        const collection = await resolveCollection("update");
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        const timestampedUpdate = withUpdateTimestamp(runtime, update);
        const raw = await (collection.findOneAndUpdate as unknown as (
          filter: MongoFilter<Document>,
          update: UpdateFilter<Document> | Document[],
          options?: ParsedFindOneAndUpdateOptions,
        ) => Promise<Document | null>)(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, timestampedUpdate),
          withSession(session, options),
        );
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async findOneAndReplace(filter, value, options) {
      const document = parseWrite(value, "replace", "update");

      try {
        const collection = await resolveCollection("replace");
        const raw = await (collection.findOneAndReplace as unknown as (
          filter: MongoFilter<Document>,
          replacement: Document,
          options?: ParsedFindOneAndReplaceOptions,
        ) => Promise<Document | null>)(
          toMongoFilter(runtime, filter),
          document,
          withSession(session, options),
        );
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async findOneAndDelete(filter, options) {
      try {
        const collection = await resolveCollection("deleteById");
        const raw = await (collection.findOneAndDelete as unknown as (
          filter: MongoFilter<Document>,
          options?: ParsedFindOneAndDeleteOptions,
        ) => Promise<Document | null>)(
          toMongoFilter(runtime, filter),
          withSession(session, options),
        );
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async deleteOne(filter = {}, options) {
      try {
        const collection = await resolveCollection("deleteById");
        return await collection.deleteOne(
          toMongoFilter(runtime, filter),
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async deleteMany(filter = {}, options) {
      try {
        const collection = await resolveCollection("deleteById");
        return await collection.deleteMany(
          toMongoFilter(runtime, filter),
          withSession(session, options),
        );
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async bulkWrite(operations, options) {
      try {
        const collection = await resolveCollection("replace");
        return await collection.bulkWrite(operations, withSession(session, options));
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async insert(value) {
      const timestamped = applyWriteTimestamps(runtime, value, "insert");
      const document = parseWrite(timestamped as Input, "insert", "none");

      try {
        const collection = await resolveCollection("insert");
        await collection.insertOne(
          document as OptionalUnlessRequiredId<Document>,
          withSession(session, undefined),
        );
        return runtime.schema.parse(timestamped);
      } catch (cause) {
        throw wrapError(runtime, "insert", cause);
      }
    },

    async replace(value) {
      const timestamped = applyWriteTimestamps(runtime, value, "update");
      const parsed = runtime.schema.parse(timestamped);
      const document = parseWrite(timestamped as Input, "replace", "none");

      try {
        const collection = await resolveCollection("replace");
        await collection.replaceOne(
          toMongoFilter(runtime, {
            [runtime.primaryKey]: (parsed as Record<string, unknown>)[runtime.primaryKey],
          } as Filter<T>),
          document,
          withSession(session, { upsert: true }),
        );
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }

      return parsed;
    },

    async setById(id, patch) {
      const existing = await this.findById(id);

      if (existing === null) {
        return null;
      }

      const parsed = parsePatchMerge(runtime, existing, patch, id);
      const timestamped = runtime.schema.parse(
        applyWriteTimestamps(runtime, parsed, "update"),
      );
      const update = {
        $set: toMongoSetPatch(runtime, timestamped, patch),
      };

      try {
        const collection = await resolveCollection("update");
        await collection.updateOne(
          toMongoFilter(runtime, { [runtime.primaryKey]: id } as Filter<T>),
          toMongoUpdate(runtime, update as UpdateFilter<T & Document>),
          withSession(session, undefined),
        );
        return timestamped;
      } catch (cause) {
        throw wrapError(runtime, "update", cause);
      }
    },

    async updateById(id, patch) {
      const existing = await this.findById(id);

      if (existing === null) {
        return null;
      }

      const patchPrimaryValue = (patch as Record<string, unknown>)[runtime.primaryKey];
      if (patchPrimaryValue !== undefined && patchPrimaryValue !== id) {
        throw new ZogError({
          modelName: runtime.modelName,
          collectionName: runtime.collectionName,
          operation: "updateById",
          details: `patch cannot change primary key ${runtime.primaryKey}`,
        });
      }

      const next = {
        ...existing,
        ...patch,
        [runtime.primaryKey]: id,
      } as T;

      return this.replace(next as unknown as Input);
    },

    async deleteById(id) {
      try {
        await this.deleteOne({ [runtime.primaryKey]: id } as Filter<T>);
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },
  };

  function findLegacyDocumentByPrimaryKey(
    collection: Collection<Document>,
    id: string,
    options: FindOneOptions | undefined,
  ): Promise<Document | null> {
    if (runtime.primaryKey === "_id") {
      return Promise.resolve(null);
    }

    return collection.findOne(
      { [runtime.primaryKey]: id } as unknown as MongoFilter<Document>,
      withSession(session, options) as MongoFindOneOptions,
    );
  }
}

export async function ensureModelIndexes<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: {
    collectionNamePolicy?: CollectionNamePolicy | null;
    collectionNameCompatibility?: CollectionNameCompatibility;
  } = {},
): Promise<void> {
  assertCollectionNamePolicy({
    modelName: model.name,
    collectionName: model.collectionName,
    policy: options.collectionNamePolicy ?? null,
    operation: "ensureIndexes",
  });
  try {
    const collectionName = await resolveCollectionNameCompatibility(db, {
      modelName: model.name,
      collectionName: model.collectionName,
      legacyCollectionNames: model.legacyCollectionNames,
      collectionNameCompatibility: options.collectionNameCompatibility ?? "off",
      operation: "ensureIndexes",
    });
    const collection = db.collection(collectionName);
    await model.beforeEnsureIndexes?.(collection);

    if (model.indexes.length > 0) {
      await collection.createIndexes(model.indexes.map(toIndexDescription));
    }
  } catch (cause) {
    throw new ZogError({
      modelName: model.name,
      collectionName: model.collectionName,
      operation: "ensureIndexes",
      cause,
    });
  }
}

export async function diffModelIndexes<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: {
    collectionNamePolicy?: CollectionNamePolicy | null;
    collectionNameCompatibility?: CollectionNameCompatibility;
  } = {},
): Promise<ModelIndexDiff> {
  assertCollectionNamePolicy({
    modelName: model.name,
    collectionName: model.collectionName,
    policy: options.collectionNamePolicy ?? null,
    operation: "diffIndexes",
  });
  try {
    const collectionName = await resolveCollectionNameCompatibility(db, {
      modelName: model.name,
      collectionName: model.collectionName,
      legacyCollectionNames: model.legacyCollectionNames,
      collectionNameCompatibility: options.collectionNameCompatibility ?? "off",
      operation: "diffIndexes",
    });
    const collection = db.collection(collectionName);
    const existingIndexes = await listExistingIndexes(collection);
    return diffIndexDescriptions(
      model.name,
      collectionName,
      model.indexes.map(toDeclaredIndex),
      existingIndexes,
    );
  } catch (cause) {
    throw new ZogError({
      modelName: model.name,
      collectionName: model.collectionName,
      operation: "diffIndexes",
      cause,
    });
  }
}

async function listExistingIndexes(collection: Collection<Document>): Promise<Document[]> {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (isNamespaceNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

function isNamespaceNotFoundError(error: unknown): boolean {
  const candidate = error as { code?: unknown; codeName?: unknown } | null;

  return (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate.code === 26 || candidate.codeName === "NamespaceNotFound")
  );
}

export type SyncIndexesOptions = {
  collectionNamePolicy?: CollectionNamePolicy | null;
  collectionNameCompatibility?: CollectionNameCompatibility;
  dryRun?: boolean;
  dropExtra?: boolean;
};

export async function syncModelIndexes<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: SyncIndexesOptions = {},
): Promise<ModelIndexDiff> {
  assertCollectionNamePolicy({
    modelName: model.name,
    collectionName: model.collectionName,
    policy: options.collectionNamePolicy ?? null,
    operation: "syncIndexes",
  });
  const dryRun = options.dryRun ?? false;
  const dropExtra = options.dropExtra ?? true;

  try {
    const collectionName = await resolveCollectionNameCompatibility(db, {
      modelName: model.name,
      collectionName: model.collectionName,
      legacyCollectionNames: model.legacyCollectionNames,
      collectionNameCompatibility: options.collectionNameCompatibility ?? "off",
      operation: "syncIndexes",
    });

    if (dryRun) {
      return await diffModelIndexes(db, model, {
        collectionNamePolicy: options.collectionNamePolicy ?? null,
        collectionNameCompatibility: options.collectionNameCompatibility ?? "off",
      });
    }

    const collection = db.collection(collectionName);
    await model.beforeEnsureIndexes?.(collection);
    const diff = await diffModelIndexes(db, model, {
      collectionNamePolicy: options.collectionNamePolicy ?? null,
      collectionNameCompatibility: options.collectionNameCompatibility ?? "off",
    });
    const indexesToDrop = dropExtra
      ? [...diff.changed, ...diff.extra]
      : diff.changed;

    for (const indexToDrop of indexesToDrop) {
      await collection.dropIndex(indexToDrop.name);
    }

    const indexesToCreate = [
      ...diff.missing.map((entry) => entry.description),
      ...diff.changed.map((entry) => entry.declared),
    ];

    if (indexesToCreate.length > 0) {
      await collection.createIndexes(indexesToCreate);
    }

    return diff;
  } catch (cause) {
    throw new ZogError({
      modelName: model.name,
      collectionName: model.collectionName,
      operation: "syncIndexes",
      cause,
    });
  }
}

function diffIndexDescriptions(
  modelName: string,
  collectionName: string,
  declaredIndexes: ReturnType<typeof toDeclaredIndex>[],
  existingIndexes: Document[],
): ModelIndexDiff {
  const existingByName = new Map(
    existingIndexes
      .map((description) => toExistingIndex(description))
      .filter((description) => description.name !== "_id_")
      .map((description) => [description.name, description] as const),
  );
  const matching: ReturnType<typeof toDeclaredIndex>[] = [];
  const missing: ReturnType<typeof toDeclaredIndex>[] = [];
  const changed: ModelIndexDiff["changed"] = [];

  for (const declared of declaredIndexes) {
    const existing = existingByName.get(declared.name);

    if (!existing) {
      missing.push(declared);
      continue;
    }

    existingByName.delete(declared.name);

    if (indexSpecsMatch(declared.description, existing.description)) {
      matching.push(declared);
    } else {
      changed.push({
        name: declared.name,
        declared: declared.description,
        existing: existing.description,
      });
    }
  }

  return {
    modelName,
    collectionName,
    matching,
    missing,
    changed,
    extra: [...existingByName.values()],
  };
}

function toExistingIndex(description: Document): ExistingIndex {
  const name = description.name;

  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("MongoDB index is missing a string name");
  }

  return {
    name,
    description,
  };
}

export type DefineDbOptions = {
  mongoClient: MongoClient;
  databaseName: string;
  collectionNamePolicy?: CollectionNamePolicy | null;
  collectionNameCompatibility?: CollectionNameCompatibility;
};

export type CreateMongoZodCollectionOptions = {
  collectionName?: string;
  collectionNamePolicy?: CollectionNamePolicy | null;
  collectionNameCompatibility?: CollectionNameCompatibility;
  session?: ClientSession;
};

export type CollectionNamePolicy = "camel" | "snake" | "pascal";
export type CollectionNameCompatibility = "off" | "error";

type DefinedRepositories<Models extends readonly AnyModelDefinition[]> = {
  [Model in Models[number] as Model["name"]]: Repository<
    InferModel<Model>,
    ModelWriteInput<Model>
  >;
};

export type TransactionalDb<Models extends readonly AnyModelDefinition[]> =
  DefinedRepositories<Models> & {
    readonly session: ClientSession;
  };

export type DefinedDb<Models extends readonly AnyModelDefinition[]> =
  DefinedRepositories<Models> & {
  ensureIndexes(): Promise<void>;
  diffIndexes(): Promise<DbIndexDiff>;
  syncIndexes(options?: SyncIndexesOptions): Promise<DbIndexDiff>;
  withSession(session: ClientSession): TransactionalDb<Models>;
  transaction<T>(
    callback: (tx: TransactionalDb<Models>) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
};

export function defineDb<const Models extends readonly AnyModelDefinition[]>(
  models: Models,
  options: DefineDbOptions,
): DefinedDb<Models> {
  const db = options.mongoClient.db(options.databaseName);
  const collectionNamePolicy = options.collectionNamePolicy ?? null;
  const collectionNameCompatibility = options.collectionNameCompatibility ?? "off";
  validateModelCollectionNames(models, collectionNamePolicy);
  const repositories = createRepositories(db, models, {
    collectionNamePolicy,
    collectionNameCompatibility,
  });

  const definedDb = {
    ...repositories,
    async ensureIndexes() {
      for (const model of models) {
        await ensureModelIndexes(db, model, {
          collectionNamePolicy,
          collectionNameCompatibility,
        });
      }
    },
    async diffIndexes() {
      return {
        models: await Promise.all(
          models.map((model) =>
            diffModelIndexes(db, model, {
              collectionNamePolicy,
              collectionNameCompatibility,
            }),
          ),
        ),
      };
    },
    async syncIndexes(options) {
      const indexDiffs: ModelIndexDiff[] = [];

      for (const model of models) {
        indexDiffs.push(
          await syncModelIndexes(db, model, {
            ...options,
            collectionNamePolicy,
            collectionNameCompatibility,
          }),
        );
      }

      return {
        models: indexDiffs,
      };
    },
    withSession(session) {
      return {
        ...createRepositories(db, models, {
          collectionNamePolicy,
          collectionNameCompatibility,
          session,
        }),
        session,
      } as TransactionalDb<Models>;
    },
    async transaction(callback, transactionOptions) {
      const session = options.mongoClient.startSession();

      try {
        return await session.withTransaction(
          () => callback(definedDb.withSession(session)),
          transactionOptions,
        );
      } finally {
        await session.endSession();
      }
    },
  } as DefinedDb<Models>;

  return definedDb;
}

function createRepositories<const Models extends readonly AnyModelDefinition[]>(
  db: Db,
  models: Models,
  options: {
    collectionNamePolicy?: CollectionNamePolicy | null;
    collectionNameCompatibility?: CollectionNameCompatibility;
    session?: ClientSession;
  } = {},
): DefinedRepositories<Models> {
  const repositories: Record<string, Repository<object, unknown>> = {};

  for (const model of models) {
    repositories[model.name] = createMongoZodCollection(db, model, {
      ...(options.collectionNamePolicy === undefined
        ? {}
        : { collectionNamePolicy: options.collectionNamePolicy }),
      ...(options.collectionNameCompatibility === undefined
        ? {}
        : { collectionNameCompatibility: options.collectionNameCompatibility }),
      ...(options.session === undefined ? {} : { session: options.session }),
    }) as Repository<object, unknown>;
  }

  return repositories as DefinedRepositories<Models>;
}

function validateModelCollectionNames(
  models: readonly AnyModelDefinition[],
  policy: CollectionNamePolicy | null,
): void {
  for (const model of models) {
    assertCollectionNamePolicy({
      modelName: model.name,
      collectionName: model.collectionName,
      policy,
      operation: "defineDb",
    });
  }
}

function assertCollectionNamePolicy(context: {
  modelName: string;
  collectionName: string;
  policy: CollectionNamePolicy | null;
  operation: ZogOperation;
}): void {
  if (context.policy === null || collectionNameMatchesPolicy(context.collectionName, context.policy)) {
    return;
  }

  throw new ZogError({
    modelName: context.modelName,
    collectionName: context.collectionName,
    operation: context.operation,
    details: `collection name must be ${context.policy} case`,
  });
}

async function resolveCollectionNameCompatibility(
  db: Db,
  context: {
    modelName: string;
    collectionName: string;
    legacyCollectionNames: readonly string[];
    collectionNameCompatibility: CollectionNameCompatibility;
    operation: ZogOperation;
  },
): Promise<string> {
  if (
    context.collectionNameCompatibility === "off" &&
    context.legacyCollectionNames.length === 0
  ) {
    return context.collectionName;
  }

  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  const collectionNames = new Set(
    collections
      .map((collection) => collection.name)
      .filter((name): name is string => typeof name === "string"),
  );
  const currentExists = collectionNames.has(context.collectionName);
  const existingLegacyCollectionNames = context.legacyCollectionNames.filter((name) =>
    collectionNames.has(name),
  );

  if (currentExists && existingLegacyCollectionNames.length > 0) {
    throw new ZogError({
      modelName: context.modelName,
      collectionName: context.collectionName,
      operation: context.operation,
      details: `collection name is split between current collection ${JSON.stringify(
        context.collectionName,
      )} and legacy collection ${JSON.stringify(existingLegacyCollectionNames[0])}`,
    });
  }

  if (existingLegacyCollectionNames.length > 1) {
    throw new ZogError({
      modelName: context.modelName,
      collectionName: context.collectionName,
      operation: context.operation,
      details: `collection name matches multiple legacy collections: ${existingLegacyCollectionNames
        .map((name) => JSON.stringify(name))
        .join(", ")}`,
    });
  }

  if (currentExists || existingLegacyCollectionNames.length === 0) {
    if (context.collectionNameCompatibility === "error") {
      assertNoImplicitCollectionNameConflict(context, collectionNames);
    }

    return context.collectionName;
  }

  return existingLegacyCollectionNames[0] ?? context.collectionName;
}

function assertNoImplicitCollectionNameConflict(
  context: {
    modelName: string;
    collectionName: string;
    operation: ZogOperation;
  },
  collectionNames: Set<string>,
): void {
  const expectedIdentity = normalizeCollectionNameIdentity(context.collectionName);
  const conflictingCollectionName = [...collectionNames].find(
    (name) =>
      name !== context.collectionName &&
      normalizeCollectionNameIdentity(name) === expectedIdentity,
  );

  if (!conflictingCollectionName) {
    return;
  }

  throw new ZogError({
    modelName: context.modelName,
    collectionName: context.collectionName,
    operation: context.operation,
    details: `collection name conflicts with existing collection ${JSON.stringify(
      conflictingCollectionName,
    )}`,
  });
}

function normalizeCollectionNameIdentity(collectionName: string): string {
  return collectionName.replace(/[-_\s]+/g, "").toLowerCase();
}

function collectionNameMatchesPolicy(
  collectionName: string,
  policy: CollectionNamePolicy,
): boolean {
  switch (policy) {
    case "camel":
      return /^[a-z][A-Za-z0-9]*$/.test(collectionName);
    case "snake":
      return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(collectionName);
    case "pascal":
      return /^[A-Z][A-Za-z0-9]*$/.test(collectionName);
  }
}

function createParsedCursor<T extends object>(
  cursor: FindCursor<Document>,
  parse: (raw: Document | null) => T | null,
): ParsedFindCursor<T> {
  async function* iterate(): AsyncGenerator<T, void, void> {
    for await (const raw of cursor) {
      const parsed = parse(raw);
      if (parsed !== null) {
        yield parsed;
      }
    }
  }

  return {
    raw: cursor,

    async toArray() {
      const documents = await cursor.toArray();
      return documents.map((raw) => {
        const parsed = parse(raw);
        if (parsed === null) {
          throw new Error("Unexpected null document");
        }
        return parsed;
      });
    },

    async next() {
      return parse(await cursor.next());
    },

    async tryNext() {
      return parse(await cursor.tryNext());
    },

    async forEach(iterator) {
      for await (const raw of cursor) {
        const parsed = parse(raw);
        if (parsed === null) {
          continue;
        }
        const result = await iterator(parsed);
        if (result === false) {
          break;
        }
      }
    },

    sort(sort, direction) {
      cursor.sort(sort, direction);
      return this;
    },

    limit(value) {
      cursor.limit(value);
      return this;
    },

    skip(value) {
      cursor.skip(value);
      return this;
    },

    project(value) {
      cursor.project(value);
      return this;
    },

    [Symbol.asyncIterator]: iterate,
  };
}

function createDeferredParsedCursor<T extends object>(
  createCursor: () => Promise<FindCursor<Document>>,
  parse: (raw: Document | null) => T | null,
): ParsedFindCursor<T> {
  type CursorOperation = (cursor: FindCursor<Document>) => void;
  const operations: CursorOperation[] = [];
  let cursor: FindCursor<Document> | undefined;
  let cursorPromise: Promise<FindCursor<Document>> | undefined;

  async function getCursor(): Promise<FindCursor<Document>> {
    cursorPromise ??= createCursor().then((created) => {
      cursor = created;
      for (const operation of operations) {
        operation(created);
      }
      return created;
    });
    return cursorPromise;
  }

  function apply(operation: CursorOperation): void {
    if (cursor) {
      operation(cursor);
      return;
    }

    operations.push(operation);
  }

  return {
    get raw() {
      if (!cursor) {
        throw new Error("Raw cursor is not available until the deferred cursor is resolved");
      }
      return cursor;
    },

    async toArray() {
      return createParsedCursor(await getCursor(), parse).toArray();
    },

    async next() {
      return createParsedCursor(await getCursor(), parse).next();
    },

    async tryNext() {
      return createParsedCursor(await getCursor(), parse).tryNext();
    },

    async forEach(iterator) {
      return createParsedCursor(await getCursor(), parse).forEach(iterator);
    },

    sort(sort, direction) {
      apply((resolved) => {
        resolved.sort(sort, direction);
      });
      return this;
    },

    limit(value) {
      apply((resolved) => {
        resolved.limit(value);
      });
      return this;
    },

    skip(value) {
      apply((resolved) => {
        resolved.skip(value);
      });
      return this;
    },

    project(value) {
      apply((resolved) => {
        resolved.project(value);
      });
      return this;
    },

    async *[Symbol.asyncIterator]() {
      for await (const value of createParsedCursor(await getCursor(), parse)) {
        yield value;
      }
    },
  };
}

function withSession<Options extends object>(
  session: ClientSession | undefined,
  options: Options | undefined,
): Options | undefined {
  if (!session) {
    return options;
  }

  return {
    ...(options ?? {}),
    session,
  } as Options;
}

function parsePatchMerge<T extends object>(
  model: ModelRuntime<T>,
  existing: T,
  patch: Partial<T>,
  id: string,
): T {
  if (patchTouchesPrimaryKey(model, patch)) {
    throw new ZogError({
      modelName: model.modelName,
      collectionName: model.collectionName,
      operation: "update",
      details: `patch cannot change primary key ${model.primaryKey}`,
    });
  }

  try {
    return model.schema.parse({
      ...existing,
      ...patch,
      [model.primaryKey]: id,
    });
  } catch (cause) {
    throw wrapError(model, "update", cause);
  }
}

function toMongoSetPatch<T extends object>(
  model: ModelRuntime<T>,
  parsed: T,
  patch: Partial<T>,
): Record<string, unknown> {
  const fields = new Set(Object.keys(patch));
  if (model.timestamps) {
    fields.add(model.timestamps.updatedAt);
  }

  const parsedRecord = parsed as Record<string, unknown>;
  const set: Record<string, unknown> = {};

  for (const field of fields) {
    if (field === model.primaryKey || field === "_id") {
      continue;
    }

    set[field] = parsedRecord[field];
  }

  return set;
}

function patchTouchesPrimaryKey<T extends object>(
  model: ModelRuntime<T>,
  patch: Partial<T>,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(patch, model.primaryKey) ||
    Object.prototype.hasOwnProperty.call(patch, "_id")
  );
}

type TimestampMode = "insert" | "update" | "none";

function applyWriteTimestamps<T extends object>(
  model: ModelRuntime<T>,
  value: unknown,
  mode: TimestampMode,
): unknown {
  if (!model.timestamps || mode === "none" || !isPlainRecord(value)) {
    return value;
  }

  const timestamp = model.timestamps.now();
  const next = {
    ...value,
    [model.timestamps.updatedAt]: timestamp,
  };

  if (mode === "insert") {
    next[model.timestamps.createdAt] = timestamp;
  }

  return next;
}

function withUpdateTimestamp<T extends object>(
  model: ModelRuntime<T>,
  update: UpdateFilter<T & Document> | Document[],
): UpdateFilter<T & Document> | Document[] {
  if (!model.timestamps) {
    return update;
  }

  const timestamp = model.timestamps.now();

  if (Array.isArray(update)) {
    return [
      ...update,
      {
        $set: {
          [model.timestamps.updatedAt]: timestamp,
        },
      },
    ];
  }

  return {
    ...(update as Document),
    $set: {
      ...(isPlainRecord((update as Document).$set) ? (update as Document).$set : {}),
      [model.timestamps.updatedAt]: timestamp,
    },
  } as UpdateFilter<T & Document>;
}

function toMongoFilter<T extends object>(
  model: ModelRuntime<T>,
  filter: Filter<T> | undefined,
): MongoFilter<Document> {
  const source = { ...(filter ?? {}) } as Record<string, unknown>;

  if (
    model.primaryKey !== "_id" &&
    Object.prototype.hasOwnProperty.call(source, model.primaryKey)
  ) {
    source._id = source[model.primaryKey];
    delete source[model.primaryKey];
  }

  return source as MongoFilter<Document>;
}

function toMongoUpdate<T extends object>(
  model: ModelRuntime<T>,
  update: UpdateFilter<T & Document> | Document[],
): UpdateFilter<Document> | Document[] {
  if (Array.isArray(update)) {
    return update;
  }

  const translated = { ...update } as Record<string, unknown>;
  const renameableOperators = ["$set", "$setOnInsert", "$unset", "$inc", "$mul", "$min", "$max"];

  for (const operator of renameableOperators) {
    const value = translated[operator];
    if (isPlainRecord(value)) {
      translated[operator] = translatePrimaryKeyKeys(model, value);
    }
  }

  return translated as UpdateFilter<Document>;
}

function translatePrimaryKeyKeys<T extends object>(
  model: ModelRuntime<T>,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (model.primaryKey === "_id") {
    return value;
  }

  const translated = { ...value };
  if (Object.prototype.hasOwnProperty.call(translated, model.primaryKey)) {
    translated._id = translated[model.primaryKey];
    delete translated[model.primaryKey];
  }

  return translated;
}

function assertUpdateDoesNotChangePrimaryKey<T extends object>(
  model: ModelRuntime<T>,
  update: UpdateFilter<T & Document> | Document[],
  operation: ZogOperation,
): void {
  if (Array.isArray(update)) {
    for (const stage of update) {
      if (updateDocumentTouchesPrimaryKey(model, stage)) {
        throwPrimaryKeyUpdateError(model, operation);
      }
    }
    return;
  }

  if (updateDocumentTouchesPrimaryKey(model, update)) {
    throwPrimaryKeyUpdateError(model, operation);
  }
}

function updateDocumentTouchesPrimaryKey<T extends object>(
  model: ModelRuntime<T>,
  update: Document,
): boolean {
  const primaryKeys = new Set([model.primaryKey, "_id"]);

  for (const [key, value] of Object.entries(update)) {
    if (primaryKeys.has(key)) {
      return true;
    }

    if (key.startsWith("$") && isPlainRecord(value)) {
      for (const nestedKey of Object.keys(value)) {
        if (primaryKeys.has(nestedKey)) {
          return true;
        }
      }
    }
  }

  return false;
}

function throwPrimaryKeyUpdateError<T extends object>(
  model: ModelRuntime<T>,
  operation: ZogOperation,
): never {
  throw new ZogError({
    modelName: model.modelName,
    collectionName: model.collectionName,
    operation,
    details: `update cannot change primary key ${model.primaryKey}`,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMongoId<T extends object>(
  model: ModelRuntime<T>,
  value: unknown,
): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof ObjectId) {
    if (model.objectIdPolicy === "stringify") {
      return value.toHexString();
    }

    throw new ZogError({
      modelName: model.modelName,
      collectionName: model.collectionName,
      operation: "findOne",
      details: "ObjectId _id is not allowed for this model",
    });
  }

  return value;
}

// Summarise the underlying cause into a string so it rides along in the
// ZogError *message* — `cause` is dropped when an error crosses a tRPC (or any
// serialization) boundary, so without this the caller only ever sees the
// generic "Zog <op> failed for <model>" line and never the real reason.
function describeCause(cause: unknown): string | undefined {
  if (cause == null) {
    return undefined;
  }

  if (isValidationError(cause)) {
    try {
      return JSON.stringify(cause.issues);
    } catch {
      return "validation failed";
    }
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === "string") {
    return cause;
  }

  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

function wrapError<T extends object>(
  model: ModelRuntime<T>,
  operation: ZogOperation,
  cause: unknown,
): ZogError {
  if (cause instanceof ZogError) {
    return cause;
  }

  const details = describeCause(cause);

  return new ZogError({
    modelName: model.modelName,
    collectionName: model.collectionName,
    operation,
    ...(details !== undefined ? { details } : {}),
    cause,
  });
}
