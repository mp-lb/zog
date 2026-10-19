## Documentation

This project publishes docs, so they're **generated from the source of truth**, not hand-maintained in parallel — they can't drift:

- A library's API reference comes from its **types**; a CLI's command reference comes from its **commander tree**. You don't hand-write these.
- **After changing public API or CLI commands/flags, run `docs:gen`** to regenerate the reference (and the `llms-full.txt` agent bundle), then commit the result.
- **`docs:check` runs in CI and fails if the committed docs are stale** — regenerating is not optional.
- Hand-written narrative (README, guides) lives beside the generated reference: update it when behaviour changes, but never restate signatures or flags — link to the reference instead.

Read `docs/standards/libs.md` for the full model (and `docs/standards/clis.md` if the package ships a `bin`).
