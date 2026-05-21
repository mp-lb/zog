# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

This repository is a pnpm workspace containing the publishable Zog library and
a Fumadocs-powered documentation site.

## Projects

- `packages/core`: shared runtime-safe constants and helpers.
- `packages/server`: Node/server helpers.
- `packages/trpc`: placeholder API contract package.
- `packages/zog`: publishable `@mp-lb/zog` library package.
- `apps/docs`: Fumadocs MDX documentation website.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
zap up
```
