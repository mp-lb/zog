import type {
  CreateIndexesOptions,
  Document,
  IndexDescription,
  IndexDirection,
} from "mongodb";

export type IndexKey = Record<string, IndexDirection> | Map<string, IndexDirection>;

export type ModelIndex = {
  key: IndexKey;
  options?: CreateIndexesOptions;
};

export type DeclaredIndex = {
  name: string;
  description: IndexDescription;
};

export type ExistingIndex = {
  name: string;
  description: Document;
};

export type ChangedIndex = {
  name: string;
  declared: IndexDescription;
  existing: Document;
};

export type ModelIndexDiff = {
  modelName: string;
  collectionName: string;
  matching: DeclaredIndex[];
  missing: DeclaredIndex[];
  changed: ChangedIndex[];
  extra: ExistingIndex[];
};

export type DbIndexDiff = {
  models: ModelIndexDiff[];
};

export function index(key: IndexKey, options?: CreateIndexesOptions): ModelIndex {
  return options === undefined ? { key } : { key, options };
}

export function uniqueIndex(
  key: IndexKey,
  options?: CreateIndexesOptions,
): ModelIndex {
  return {
    key,
    options: {
      ...options,
      unique: true,
    },
  };
}

export function toIndexDescription(modelIndex: ModelIndex): IndexDescription {
  return {
    ...modelIndex.options,
    key: modelIndex.key,
  };
}

export function toDeclaredIndex(modelIndex: ModelIndex): DeclaredIndex {
  const description = toIndexDescription(modelIndex);
  return {
    name: description.name ?? defaultIndexName(modelIndex.key),
    description,
  };
}

export function indexSpecsMatch(
  declared: IndexDescription,
  existing: Document,
): boolean {
  return (
    stableStringify(normalizeDeclaredIndex(declared)) ===
    stableStringify(normalizeExistingIndex(existing))
  );
}

function defaultIndexName(key: IndexKey): string {
  return Object.entries(indexKeyToObject(key))
    .map(([field, direction]) => `${field}_${String(direction)}`)
    .join("_");
}

function indexKeyToObject(key: IndexKey): Record<string, IndexDirection> {
  if (key instanceof Map) {
    return Object.fromEntries(key.entries());
  }

  return { ...key };
}

function normalizeDeclaredIndex(indexDescription: IndexDescription): Document {
  const { key, ...options } = indexDescription;
  const name = indexDescription.name ?? defaultIndexName(key as IndexKey);

  return stripUndefined({
    ...options,
    name,
    key: indexKeyToObject(key as IndexKey),
  });
}

function normalizeExistingIndex(indexDescription: Document): Document {
  const { key, name, ns, v, ...options } = indexDescription;

  return stripUndefined({
    ...options,
    name,
    key: isIndexKey(key) ? indexKeyToObject(key) : key,
  });
}

function isIndexKey(value: unknown): value is IndexKey {
  return (
    value instanceof Map ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

function stripUndefined(value: Document): Document {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value instanceof Map) {
    return sortJson(Object.fromEntries(value.entries()));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
  }

  return value;
}
