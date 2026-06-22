# Agent Instructions

Always read `AGENTS.md` when starting new chats if it exists.

## Project

- Name: Zog
- Description: Better integration for Zod and MongoDB
- Package scope: `@mp-lb`
- Project slug: `zog`

## Workspace

- Use `pnpm` for package management.
- Docs app: `apps/docs`
- Library package: `packages/zog` (`@mp-lb/zog`)

## Validation

Run these after setup or code changes:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

For full setup validation, also run:

```bash
zap task setup
zap up
```
