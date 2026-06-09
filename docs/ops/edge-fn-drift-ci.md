# Edge function drift CI gate

## What it does

The workflow at `.github/workflows/edge-fn-drift-check.yml` runs on every
pull request that touches anything under `supabase/functions/**`.

For each edge function slug whose source changed in the PR, it:

1. Identifies the slug(s) via `git diff` against the PR base branch.
2. Downloads the **currently deployed** source from Supabase via
   `supabase functions download <slug> --project-ref <ref>`.
3. Normalizes line endings (`CRLF → LF`) and trailing newlines on both
   the PR copy and the deployed copy.
4. Diffs them. If they don't match, the job **fails** and posts a PR
   comment with the diff so the reviewer can see exactly what would be
   clobbered.

`_shared/` is excluded — it isn't a deployable function.

## Why it exists

A 2026-06 audit found 5+ edge functions where deployed source had drifted
from git over time. Causes:

- Hand-edits via Supabase Dashboard UI that never made it back to git.
- Hot-fix deploys from local checkouts that bypassed PR review.
- "v9 force redeploy" cycles where multiple engineers raced each other.

In two cases, the drift contained real production fixes — any naive
`supabase functions deploy` from git would have silently destroyed them.
This gate stops that class of regression at the PR boundary.

## Operator setup (one-time)

1. Generate a Supabase **personal access token**:
   - <https://supabase.com/dashboard/account/tokens>
   - Name it something like `gha-edge-fn-drift-check`.
   - Copy the token (you'll only see it once).

2. Add it as a GitHub repository secret:
   - GitHub repo → **Settings** → **Secrets and variables** → **Actions**.
   - **New repository secret**.
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Value: paste the token from step 1.

3. The project ref (`jkmrfiaefxwgbvftohrb`) is hardcoded in the workflow.
   If LIT ever uses a different project for staging vs prod, promote it
   to a repo variable and reference `${{ vars.SUPABASE_PROJECT_REF }}`.

That's it. The next PR that touches `supabase/functions/**` will run the
check.

## How to handle a `DRIFT` failure

You'll see a PR comment titled **"Edge function drift check"** with a
collapsible diff per drifted slug. The diff is `PR → deployed`, so:

- Lines marked `-` are in your PR but **not** in production.
- Lines marked `+` are in production but **not** in your PR.

If you'd land the PR as-is, the `+` lines would be deleted on deploy.

**Resolution (the safe path):**

```bash
# From the repo root, on your PR branch:
supabase functions download <slug> --project-ref jkmrfiaefxwgbvftohrb
# This overwrites supabase/functions/<slug>/index.ts with the deployed copy.

# Now reconcile by hand:
#   - Re-apply your PR's intended changes on top of the deployed source.
#   - Commit, push. The drift check should pass on the next run.
git add supabase/functions/<slug>/index.ts
git commit -m "fix(<slug>): reconcile with deployed source before re-deploy"
git push
```

**Investigate why it drifted.** Once your PR is green again, look at the
deployed diff — those `+` lines came from somewhere. If they're an
undocumented hot-fix, the engineer who deployed it needs to know it's
now in git. Update [docs/agents/](../agents/) if the change is
load-bearing.

## How to bypass (legitimate cases only)

The check is **not bypassable via labels** by design — drift is the kind
of thing that hides forever if it's bypassable. The legitimate cases are
all handled automatically by the workflow:

| Case | What the workflow does |
|---|---|
| Brand-new function (no deployed copy yet) | CLI returns "not found" → workflow emits a `::warning::` and continues. |
| Function exists in git but `index.ts` is missing | Skipped with a warning. |
| Deployed download fails for any other reason (network, auth, etc.) | Skipped with a warning. Re-run the job once the transient issue clears. |
| Intentional rewrite where you *want* to overwrite deployed | Run `supabase functions download <slug> ...` first, commit the deployed source as a separate commit, then layer your intentional rewrite on top. The diff in the PR review will then show your rewrite explicitly. |

If you genuinely need to merge a PR that the gate flags red and can't
reconcile in the moment (e.g., the deployed source is corrupted), open
an issue, add the `drift-override-approved` label, and have a platform
admin temporarily disable the workflow via GitHub UI. Re-enable
immediately after merge. **Do not merge silently.**

## Known limitations

- **PR-only.** The gate runs on `pull_request`, not on pushes to `main`.
  Direct pushes to `main` are rare in this repo (branch protection
  enforces PRs for `supabase/functions/**`), but if that changes, add a
  `push: branches: [main]` trigger.
- **Supabase CLI flag drift.** Tested against `supabase` CLI v1.x as of
  2026-06. If the `--legacy-bundle` flag changes upstream, the
  download step will fail loudly — adjust the flag in
  `edge-fn-drift-check.yml` and re-run.
- **Whitespace normalization is minimal.** We strip `\r` and ensure
  trailing newlines. If pre-deploy tooling reformats source (e.g.,
  Prettier on save), broader normalization may be needed; switch the
  `diff` invocation to `diff -bB` to ignore all whitespace.
- **Only checks `index.ts`.** Functions with multiple files (e.g.,
  helpers under the slug directory) aren't compared. Today this matches
  the LIT pattern: every function is a single `index.ts` plus
  `_shared/` imports. If we adopt multi-file functions, extend the
  workflow to walk every file under the slug directory.
