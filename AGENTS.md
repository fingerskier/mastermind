# AGENTS.md

This file applies to the whole repository.

## Development Loop

Use this process for product and implementation work:

1. Check or update the specification.
   - Start with `SPECIFICATION.md`.
   - If the change touches a durable contract, add or update the relevant focused doc under `specification/`.
   - Keep implementation aligned with the documented product behavior.

2. TDD implement.
   - Add or update a failing test before or alongside the implementation.
   - Keep tests scoped to the behavior being changed.
   - Prefer existing test style, helpers, and project structure.

3. Run an actual product evaluation.
   - For CLI behavior, run the real CLI command path, not only unit tests.
   - For UI behavior, run a Playwright evaluation against the local app.
   - Record the relevant command, URL, or eval path in the final handoff.

4. Update documentation.
   - Add or update relevant documentation in `README.md` or other docs.
   - Ensure the documentation reflects the implemented behavior and any new features.

## Dogfood Council

Use `.dogfood-council/` for local product-development dogfooding.

- The directory is intentionally ignored by Git.
- Treat it as disposable runtime state for exercising Landsraad workflows.
- Do not put secrets, customer data, or private operational data in tracked files.
- When the CLI can initialize councils, prefer regenerating this directory through the real CLI instead of hand-maintaining it.
- Dogfood results are useful evidence, but they do not replace automated tests.

## Git Usage
- It is okay for you to commit directly to main
- Use branches and/or worktrees for large or experimental features
