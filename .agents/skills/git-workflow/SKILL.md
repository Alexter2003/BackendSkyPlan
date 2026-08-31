---
name: git-workflow
description: "Enforces BackendSkyPlan's branching and PR workflow. Use this skill whenever about to start work on a feature/fix (before creating a branch), before committing directly, or before merging — anything that touches how code lands on main. Applies to every dev on the team, not just solo work."
---

# BackendSkyPlan — Git Workflow

**Nobody commits or pushes directly to `main`.** Every change, no matter how small, goes through a branch + PR, even for a single dev working alone — this keeps the habit consistent across the team and gives every change a review point and a CI gate.

## Branch naming

```
<type>/<short-kebab-description>
```

Use the same `<type>` vocabulary as [[commit-conventions]]: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.

Examples:
- `feat/activity-weather-matching`
- `fix/session-expiry-check`
- `chore/upgrade-prisma-6`

Branch always from an up-to-date `main`:

```bash
git checkout main
git pull
git checkout -b feat/<short-description>
```

## Making changes

- Commit early and often on the branch, each commit following [[commit-conventions]].
- Keep the branch scoped to one feature/fix. If unrelated work comes up, start a separate branch.
- Rebase on `main` (not merge `main` into the branch) if the branch falls behind, unless the user explicitly asks otherwise — keeps history linear. Never force-push over a branch other devs are also pushing to without checking with them first.

## Opening a Pull Request

**Every branch gets a PR before merging — no exceptions, even for trivial changes.**

1. Push the branch: `git push -u origin <branch-name>`
2. Open the PR with `gh pr create`:
   - **Title**: follows [[commit-conventions]] format (`type(scope): subject`) — it becomes the squash-merge commit message.
   - **Body**: use the template below.
3. Never merge your own PR immediately after opening it without at least a self-review pass (read the diff on GitHub, not just locally) unless the user explicitly says to merge now.

### PR body template

```markdown
## Summary
- <1-3 bullets on what changed and why>

## Changes
- <notable files/areas touched, especially schema/migration/dependency changes>

## Test plan
- [ ] <how this was verified — tests run, manual check, etc.>

## Notes for reviewers
- <anything a reviewer should pay special attention to, e.g. a migration, a new dependency (see [[dependency-management]]), a breaking change>
```

## Merging

- Prefer **squash and merge** so `main` history stays one commit per feature, matching the Conventional Commits title.
- Delete the branch after merge.
- If the PR touches `prisma/schema.prisma`, confirm the migration was generated and applied (see the `prisma-database-setup` skill) before merging — never merge a schema change without its migration file committed.
- If the PR adds/changes a dependency, confirm `DEPENDENCIES.md` was updated (see [[dependency-management]]) before merging.

## Never do this

- Commit directly to `main`
- Force-push `main`
- Merge a PR with failing CI/tests without explicit user confirmation
- Skip the PR step "because it's a small change"
