# Skill Authoring Process

## 1. Create The Folder

Create `authored-skills/<skill-name>/`.

Use lowercase letters, digits, and hyphens only.

## 2. Write `SKILL.md`

Add only this frontmatter:

```yaml
---
name: skill-name
description: Use when Codex needs to ...
---
```

Write the body as direct instructions.

## 3. Split Supporting Material

Move long examples, source notes, policies, schemas, prompts, and domain guidance into `references/`.

Use `scripts/` for repeatable operations that should run the same way every time.

Use `assets/` for templates, images, fonts, and other files used in generated outputs.

## 4. Tighten The Skill

Remove:

- introductions
- "this document explains" phrasing
- repeated context
- user-facing documentation
- generic advice Codex already knows

Keep:

- trigger-relevant constraints
- ordered workflows
- required commands
- concrete checks
- paths to references

## 5. Validate

Check that:

- `SKILL.md` exists.
- frontmatter contains only `name` and `description`.
- referenced files exist.
- optional folders are actually used.
- scripts run without errors.

## 6. Iterate From Use

Update the skill when Codex hesitates, asks avoidable questions, repeats work, or misses an expected artifact.
