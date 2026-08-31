---
name: commit-conventions
description: "Enforces Conventional Commits for BackendSkyPlan. Use this skill whenever writing a git commit message, amending one, or reviewing a PR's commit history — including squash-merge commit messages."
---

# BackendSkyPlan — Commit Conventions

All commits follow **Conventional Commits**, in **English**, regardless of the language used in chat.

## Format

```
<type>(<scope>): <short imperative subject>

[optional body: why, not what]

[optional footer: BREAKING CHANGE:, refs #issue]
```

## Allowed types

- `feat` — new feature or capability
- `fix` — bug fix
- `chore` — tooling, config, deps, non-code maintenance
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or fixing tests only
- `docs` — documentation only

Do not invent other types (`update`, `misc`, `wip`, etc.) — map the change to the closest one above.

## Scope

Use the feature/module name from `src/modules/<feature>/` as the scope (see [[project-structure]]). Examples: `feat(auth): add password reset endpoint`, `fix(visits): correct latitude precision`. Omit scope only for changes that touch the whole repo (`chore: update pnpm lockfile`).

## Subject rules

- Imperative mood: "add", not "added" or "adds"
- No period at the end
- Lowercase after the type/scope
- Short enough to read in a `git log --oneline` (~70 chars)

## Body rules

- Explain **why**, not what — the diff already shows what changed
- Wrap at ~72 chars
- Use it for anything non-obvious: a workaround, a tradeoff, a link to context

## Breaking changes

Add a footer `BREAKING CHANGE: <description>` when a change alters an existing API contract, DB schema in a non-additive way, or environment variable requirements.

## Examples

```
feat(activities): add weather-based activity suggestions endpoint

fix(sessions): expire sessions server-side, not just on client logout

chore: add tsx as seed script runner

refactor(users): extract password hashing into shared util

docs: document Prisma migration workflow for Supabase
```

## Enforcement

Every commit on a feature branch should individually follow this format — don't defer it to a squash-merge cleanup. The PR title (see [[pr-workflow]]) must also follow this format, since it becomes the squash-merge commit message.
