# Frontend Logging

Use this as a shape reference for frontend logging. Adapt it to the target framework and runtime.

Keep logging behind an app-owned helper so behavior can change later:

```ts
type LogMeta = Record<string, unknown>;

export const log = {
  info(message: string, meta: LogMeta = {}) {
    console.info(message, meta);
  },
  warn(message: string, meta: LogMeta = {}) {
    console.warn(message, meta);
  },
  error(message: string, meta: LogMeta = {}) {
    console.error(message, meta);
  },
};
```

Use logs for operational signals, not user feedback:

```ts
try {
  await saveItem(input);
  log.info("item.save.success", { itemId });
} catch (error) {
  log.error("item.save.failure", { itemId, error });
  throw error;
}
```

Prefer structured names and metadata:

- `feature.action.result`
- stable IDs, not full user input
- no secrets or tokens
- no noisy render-loop logs
