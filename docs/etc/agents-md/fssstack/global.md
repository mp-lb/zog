# How we work

## AGENTS.md and CLAUDE.md

A few conventions about these instruction files themselves:

- **The source is `agents-md/` building blocks; the agent files are *compiled* from them.** `agents-md/index.md` composes the blocks — an H1, a short intro, and a flat list of `@<block>.md` imports: the project's own blocks plus shared blocks pulled in via store references (e.g. `@fssstack/<block>.md`). The blocks + `index.md` are the **only** things you hand-edit.
- **`CLAUDE.md` and `AGENTS.md` are generated outputs, not source.** [`@mp-lb/mdcompile`](https://www.npmjs.com/package/@mp-lb/mdcompile) compiles `index.md` into one flat file per agent — `CLAUDE.md` for Claude, `AGENTS.md` for Codex and the de-facto standard (same content). They're **gitignored — compiled locally, never committed, never hand-edited.** Regenerate with `zap task compile-agents`. No agent's native import syntax is load-bearing, so supporting another agent is just another compile target.
- **The compiled agent file is small on purpose.** It carries the always-true essentials and *points* at the detailed `docs/standards/*` for the rest — read those on demand rather than expecting everything to be in context.

## Tools you can expect to be authenticated

A handful of CLI tools are installed and already authenticated on this machine — use them freely, no setup required.

- **GitHub CLI (`gh`)** — we don't use PRs, but use it to check Actions runs, read issues, inspect remote state.
- **Google Cloud CLI (`gcloud`)**
- **AWS CLI (`aws`)**
- **Zapper** — our process manager and task runner.
- **Doctrine** — our document sync system.

## Git

Some projects use git and some use Doctrine, so be aware of which kind you're in.

**Local-first.** Work happens locally. Branches isolate a piece of work before it merges to `main`. We **rarely push to GitHub — only to deploy**, from `main`, as a separate step. We never use PRs.

**Commit incrementally.** Commit changes straight away. For follow-up fixes, make a new commit, and commit only your own changes — not unrelated ones (other agents may be in the same repo).

**Messages.** No conventions — a short lowercase string. For a follow-up fix, prefix with `fix: `.

## Deployments

Many projects deploy via CI when you push `main`. To confirm a deploy landed, lean on `gh`: glance at how long recent runs took, then schedule a recheck on a fitting cadence rather than polling tightly. Specifics vary by project.

## Doctrine

Unlike GitHub there are no branches — there's always a single source of truth. **Sync before you edit:** the source lives in the cloud, so the local copy can be stale, and editing stale is how you get conflicts. Pull latest first. After syncing, we commit the synced files to git too, so they always live in the repo.

## Task running

Run migrations, tests, the dev server, checks and static analysis, and everything else as **zap tasks** — otherwise environment variables aren't picked up. Add an **npm script only** when CI also needs to run something (prefix those to mark them as CI scripts); the one other exception is super-basic things like the dev server or build, which often connect to Vercel. Two or three standard scripts is fine; four is suspicious — at least one is probably dangling.

## Builds

We run builds locally mainly to confirm they pass. For libraries and especially **CLIs**, we build to produce the artifact; for web servers and apps, mostly just to test that the build runs.

## CLIs

We always keep CLIs built, and make sure the local PATH command is linked to the locally built copy. Check this after making changes to a CLI.

## Working alongside other agents

You're rarely the only agent at work — multiple agents run in the same repo, often the same branch, at once.

- **A dirty tree is normal — it doesn't block you.** Do your own work; don't touch the files someone else is changing, and when you commit, stage only your own files. Only **stop** if your change genuinely collides with a file in flight. Unfamiliar edits are almost certainly another agent's — work around them.
- **Collaboration is often coordinated through RFWs** (below).

## Requests for Work (RFWs)

Discrete work is handed off as **Requests for Work** — a single markdown file carrying the spec for one piece of work: a short header plus **Spec** (definition of done) and **Context**. It's not a ticket — just a clear written spec that travels with the work. Managed in `mgr`: unread `~/Code/mgr/rfw/<project>/<slug>.md`, read `~/Code/mgr/rfw/<project>/read/<slug>.md`. Move it to `read/` as soon as the project picks it up. Template: `~/Code/mgr/processes/rfw.md`.

## Frontend patterns

Beyond the stack itself (shadcn/ui, Tailwind, tRPC — see the tech-stack and ui blocks), the patterns we lean on:

- The **typeahead** pattern — a command box plus a popover (shadcn popovers, menus, command components).
- **Components we standardize early:** standard modals (one standard-modal component owning scrollbars/footers/action buttons), modal layout (modals as a global layer), and layout components (layout primitives own all whitespace via flex gap; content components are "dumb" and carry no padding of their own).

We have lots of frontend **standards** — always read the ones relevant to what you're working on.

## Backend

The backend is just **tRPC**, few layers. tRPC and Zod handle serialization, so database queries can go directly in procedure handlers — fine for most projects; pull a query into a shared function only when it's used repeatedly.

**Standards to watch:** `errors.md` (throwing/handling exceptions across front and back), `event-schema.md` (anything log-shaped — we treat logs as events).

**Zod-centric schemas.** The same schema serves the database, the API, and frontend forms. Keep them in a central registry (usually the core package); group by domain and avoid duplication — if the same keys appear two or three times, make it its own schema others extend.
