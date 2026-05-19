import type {
  CreateIndexesOptions,
  IndexDescription,
  IndexDirection,
} from "mongodb";

export type IndexKey = Record<string, IndexDirection> | Map<string, IndexDirection>;

export type ModelIndex = {
  key: IndexKey;
  options?: CreateIndexesOptions;
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
