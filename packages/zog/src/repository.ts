import {
  ObjectId,
  type Abortable,
  type AnyBulkWriteOperation,
  type BulkWriteOptions,
  type BulkWriteResult,
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
  type UpdateFilter,
  type UpdateOptions,
  type UpdateResult,
} from "mongodb";
import { ZogError, type ZogOperation } from "./error.js";
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
  findById(id: string): Promise<TOutput | null>;
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
  updateById(id: string, patch: Partial<TOutput>): Promise<TOutput | null>;
  deleteById(id: string): Promise<void>;
};

type ModelRuntime<T extends object> = {
  modelName: string;
  collectionName: string;
  primaryKey: string;
  schema: ZogSchema<T>;
  normalizeLegacy: ((raw: Record<string, unknown>) => Record<string, unknown>) | undefined;
  objectIdPolicy: "reject" | "stringify";
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

  const normalized = model.normalizeLegacy
    ? model.normalizeLegacy({ ...raw })
    : { ...raw };

  const mongoId = normalized._id;
  const primaryValue = normalized[model.primaryKey];
  const normalizedMongoId = normalizeMongoId(model, mongoId);

  if (primaryValue === undefined && normalizedMongoId !== undefined) {
    normalized[model.primaryKey] = normalizedMongoId;
  } else if (
    primaryValue !== undefined &&
    normalizedMongoId !== undefined &&
    primaryValue !== normalizedMongoId
  ) {
    throw new ZogError({
      modelName: model.modelName,
      collectionName: model.collectionName,
      operation: "findOne",
      details: `primary key mismatch: _id does not match ${model.primaryKey}`,
    });
  }

  if (model.primaryKey !== "_id") {
    delete normalized._id;
  }

  return normalized;
}

export function createMongoZodCollection<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: CreateMongoZodCollectionOptions = {},
): Repository<InferModel<Model>, SchemaInput<Model["schema"]>> {
  type T = InferModel<Model>;
  type Input = SchemaInput<Model["schema"]>;

  const collectionName = options.collectionName ?? model.collectionName;
  const collection = db.collection(collectionName) as Collection<Document>;
  const runtime: ModelRuntime<T> = {
    modelName: model.name,
    collectionName,
    primaryKey: model.primaryKey,
    schema: model.schema as ZogSchema<T>,
    normalizeLegacy: model.normalizeLegacy,
    objectIdPolicy: model.objectIdPolicy,
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

  function parseWrite(value: Input, operation: ZogOperation): MongoDocument<T> {
    try {
      const parsed = runtime.schema.parse(value);
      return toMongo(runtime, parsed);
    } catch (cause) {
      throw wrapError(runtime, operation, cause);
    }
  }

  return {
    raw: collection,

    find(filter = {}, options) {
      const cursor = collection.find(
        toMongoFilter(runtime, filter),
        options as MongoFindOptions<Document>,
      );
      return createParsedCursor(cursor, (raw) => parseReadDocument(raw, "findMany"));
    },

    async findById(id) {
      const raw = await collection.findOne({ _id: id } as unknown as MongoFilter<Document>);
      return parseRead(raw, "findById");
    },

    async findOne(filter = {}, options) {
      const raw = await collection.findOne(
        toMongoFilter(runtime, filter),
        options as MongoFindOneOptions,
      );
      return parseRead(raw, "findOne");
    },

    async findMany(filter, options) {
      try {
        const rawDocuments = await collection
          .find(toMongoFilter(runtime, filter), options as MongoFindOptions<Document>)
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
      const document = parseWrite(value, "insert");

      try {
        return await collection.insertOne(
          document as OptionalUnlessRequiredId<Document>,
          options,
        );
      } catch (cause) {
        throw wrapError(runtime, "insert", cause);
      }
    },

    async insertMany(values, options) {
      const documents = values.map((value) => parseWrite(value, "insert"));

      try {
        return await collection.insertMany(
          documents as OptionalUnlessRequiredId<Document>[],
          options,
        );
      } catch (cause) {
        throw wrapError(runtime, "insert", cause);
      }
    },

    async replaceOne(filter, value, options) {
      const document = parseWrite(value, "replace");

      try {
        return await collection.replaceOne(
          toMongoFilter(runtime, filter),
          document,
          options,
        );
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async updateOne(filter, update, options) {
      try {
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        return await collection.updateOne(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, update),
          options,
        );
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async updateMany(filter, update, options) {
      try {
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        return await collection.updateMany(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, update),
          options,
        );
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async findOneAndUpdate(filter, update, options) {
      try {
        assertUpdateDoesNotChangePrimaryKey(runtime, update, "updateById");
        const raw = await (collection.findOneAndUpdate as unknown as (
          filter: MongoFilter<Document>,
          update: UpdateFilter<Document> | Document[],
          options?: ParsedFindOneAndUpdateOptions,
        ) => Promise<Document | null>)(
          toMongoFilter(runtime, filter),
          toMongoUpdate(runtime, update),
          options,
        );
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "updateById", cause);
      }
    },

    async findOneAndReplace(filter, value, options) {
      const document = parseWrite(value, "replace");

      try {
        const raw = await (collection.findOneAndReplace as unknown as (
          filter: MongoFilter<Document>,
          replacement: Document,
          options?: ParsedFindOneAndReplaceOptions,
        ) => Promise<Document | null>)(toMongoFilter(runtime, filter), document, options);
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async findOneAndDelete(filter, options) {
      try {
        const raw = await (collection.findOneAndDelete as unknown as (
          filter: MongoFilter<Document>,
          options?: ParsedFindOneAndDeleteOptions,
        ) => Promise<Document | null>)(toMongoFilter(runtime, filter), options);
        return parseRead(raw, "findOne");
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async deleteOne(filter = {}, options) {
      try {
        return await collection.deleteOne(toMongoFilter(runtime, filter), options);
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async deleteMany(filter = {}, options) {
      try {
        return await collection.deleteMany(toMongoFilter(runtime, filter), options);
      } catch (cause) {
        throw wrapError(runtime, "deleteById", cause);
      }
    },

    async bulkWrite(operations, options) {
      try {
        return await collection.bulkWrite(operations, options);
      } catch (cause) {
        throw wrapError(runtime, "replace", cause);
      }
    },

    async insert(value) {
      await this.insertOne(value);
      return runtime.schema.parse(value);
    },

    async replace(value) {
      const parsed = runtime.schema.parse(value);
      await this.replaceOne(
        { [runtime.primaryKey]: (parsed as Record<string, unknown>)[runtime.primaryKey] } as Filter<T>,
        value,
        { upsert: true },
      );
      return parsed;
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
}

export async function ensureModelIndexes<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
): Promise<void> {
  const collection = db.collection(model.collectionName);

  try {
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
): Promise<ModelIndexDiff> {
  const collection = db.collection(model.collectionName);

  try {
    const existingIndexes = await collection.listIndexes().toArray();
    return diffIndexDescriptions(
      model.name,
      model.collectionName,
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

export type SyncIndexesOptions = {
  dryRun?: boolean;
  dropExtra?: boolean;
};

export async function syncModelIndexes<Model extends AnyModelDefinition>(
  db: Db,
  model: Model,
  options: SyncIndexesOptions = {},
): Promise<ModelIndexDiff> {
  const collection = db.collection(model.collectionName);
  const dryRun = options.dryRun ?? false;
  const dropExtra = options.dropExtra ?? true;

  try {
    if (dryRun) {
      return await diffModelIndexes(db, model);
    }

    await model.beforeEnsureIndexes?.(collection);
    const diff = await diffModelIndexes(db, model);
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
};

export type CreateMongoZodCollectionOptions = {
  collectionName?: string;
};

export type DefinedDb<Models extends readonly AnyModelDefinition[]> = {
  [Model in Models[number] as Model["name"]]: Repository<
    InferModel<Model>,
    SchemaInput<Model["schema"]>
  >;
} & {
  ensureIndexes(): Promise<void>;
  diffIndexes(): Promise<DbIndexDiff>;
  syncIndexes(options?: SyncIndexesOptions): Promise<DbIndexDiff>;
};

export function defineDb<const Models extends readonly AnyModelDefinition[]>(
  models: Models,
  options: DefineDbOptions,
): DefinedDb<Models> {
  const db = options.mongoClient.db(options.databaseName);
  const repositories: Record<string, Repository<object, unknown>> = {};

  for (const model of models) {
    repositories[model.name] = createMongoZodCollection(db, model) as Repository<
      object,
      unknown
    >;
  }

  return {
    ...repositories,
    async ensureIndexes() {
      for (const model of models) {
        await ensureModelIndexes(db, model);
      }
    },
    async diffIndexes() {
      return {
        models: await Promise.all(models.map((model) => diffModelIndexes(db, model))),
      };
    },
    async syncIndexes(options) {
      const indexDiffs: ModelIndexDiff[] = [];

      for (const model of models) {
        indexDiffs.push(await syncModelIndexes(db, model, options));
      }

      return {
        models: indexDiffs,
      };
    },
  } as DefinedDb<Models>;
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

function wrapError<T extends object>(
  model: ModelRuntime<T>,
  operation: ZogOperation,
  cause: unknown,
): ZogError {
  if (cause instanceof ZogError) {
    return cause;
  }

  return new ZogError({
    modelName: model.modelName,
    collectionName: model.collectionName,
    operation,
    cause,
  });
}
