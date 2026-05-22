# Skill Writing Style

## Voice

Use imperative instructions.

Use:

```text
Read `references/schema.md` before writing SQL.
Ask for the deployment target if none is provided.
Run `scripts/check.sh` before final response.
```

Avoid:

```text
This skill helps you understand how to write SQL.
You may want to ask the user for a deployment target.
The script can be used to check the work.
```

## Content Rules

- Write for execution.
- Use short paragraphs.
- Prefer lists of actions and checks.
- State decision rules directly.
- Name exact files and commands.
- Put rare or detailed context in `references/`.
- Delete anything that only explains why skills exist.

## `SKILL.md` Rules

- Keep the body focused on the core workflow.
- Link each reference with when to read it.
- Do not add README-style sections.
- Do not duplicate reference content.
- Do not include publishing notes.

## Trigger Description

Put trigger information in the YAML `description`.

Include:

- what the skill does
- when Codex should use it
- important file types, tools, or task names

Do not rely on a "When to use" section in the body.
