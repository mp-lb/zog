export type ZogOperation =
  | "defineDb"
  | "findById"
  | "findOne"
  | "findMany"
  | "insert"
  | "replace"
  | "update"
  | "updateById"
  | "deleteById"
  | "ensureIndexes"
  | "diffIndexes"
  | "syncIndexes";

export type ZogErrorContext = {
  modelName: string;
  collectionName: string;
  operation: ZogOperation;
  details?: string;
  cause?: unknown;
};

export type ZogValidationError = {
  issues: unknown[];
};

/**
 * Error thrown by repository and index operations when a model operation fails.
 * Carries the model, collection, and operation that failed; when the underlying
 * cause is a Zod validation error it is surfaced via {@link ZogError.validationError}.
 */
export class ZogError extends Error {
  readonly modelName: string;
  readonly collectionName: string;
  readonly operation: ZogOperation;
  readonly details: string | undefined;
  override readonly cause: unknown;

  constructor(context: ZogErrorContext) {
    const detailSuffix = context.details ? `: ${context.details}` : "";
    super(
      `Zog ${context.operation} failed for ${context.modelName} (${context.collectionName})${detailSuffix}`,
      { cause: context.cause },
    );

    this.name = "ZogError";
    this.modelName = context.modelName;
    this.collectionName = context.collectionName;
    this.operation = context.operation;
    this.details = context.details;
    this.cause = context.cause;
  }

  get validationError(): ZogValidationError | undefined {
    return isValidationError(this.cause) ? this.cause : undefined;
  }

  get zodError(): ZogValidationError | undefined {
    return this.validationError;
  }
}

export function isValidationError(value: unknown): value is ZogValidationError {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray((value as { issues?: unknown }).issues)
  );
}
