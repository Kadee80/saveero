# GitHub branch protection settings

One-time setup. Once configured, `main` is gated by CI + reviews and
nobody can accidentally push a broken commit straight to it.

---

## Settings to flip on `main`

In GitHub repo → **Settings** → **Branches** → **Branch protection rules** → **Add rule**.

**Branch name pattern:** `main`

Then check the following boxes:

| Setting | Value | Why |
|---|---|---|
| **Require a pull request before merging** | ✅ | No direct pushes to main |
| ↳ **Require approvals** | `1` when team ≥ 2; `0` while solo | Pair review for non-solo work |
| ↳ **Dismiss stale pull request approvals when new commits are pushed** | ✅ | Stops the "approved, then snuck a change in" pattern |
| ↳ **Require review from Code Owners** | ❌ (skip for now) | Wait until we have a CODEOWNERS file |
| **Require status checks to pass before merging** | ✅ | Gate on CI |
| ↳ **Require branches to be up to date before merging** | ✅ | Stops merging stale branches that haven't seen recent main commits |
| ↳ **Status checks that must pass** | Add: `backend (pytest)`, `frontend (tsc + vite build)` | (Show up after CI has run once on a PR) |
| **Require conversation resolution before merging** | ✅ | All PR comments must be resolved |
| **Require signed commits** | ❌ | Skip — too much setup overhead for current size |
| **Require linear history** | ✅ | Plays nicely with squash-merge |
| **Require deployments to succeed before merging** | ❌ | Skip — Vercel previews aren't a deploy in this sense |
| **Lock branch** | ❌ | Obvious |
| **Do not allow bypassing the above settings** | ✅ | No "I'll just push it as admin" |
| **Restrict who can push to matching branches** | ❌ | Skip — the PR rule already gates this |
| **Allow force pushes** | ❌ | Never on main |
| **Allow deletions** | ❌ | Never on main |

Save.

---

## Settings to flip on `staging`

We don't want full protection on `staging` — the whole point is anyone can push to it temporarily for a preview. But a couple of guardrails help:

**Branch name pattern:** `staging`

| Setting | Value |
|---|---|
| **Require a pull request before merging** | ❌ — direct push is allowed (that's the workflow) |
| **Allow force pushes** | ✅ — `--force-with-lease` is the only way the staging workflow works |
| **Allow deletions** | ❌ — keep the branch around |

Save.

---

## Repository-level settings

Go to **Settings** → **General** → scroll to **Pull Requests**:

| Setting | Value | Why |
|---|---|---|
| **Allow merge commits** | ❌ | Keeps history flat |
| **Allow squash merging** | ✅ | Default merge button — one commit per PR |
| **Allow rebase merging** | ❌ | One way to merge, less to teach |
| **Always suggest updating pull request branches** | ✅ | UI nag to keep branches fresh |
| **Allow auto-merge** | ✅ | Let people queue PRs to merge once CI passes |
| **Automatically delete head branches** | ✅ | Cleans up branch list after merge |

---

## After CI has run once

The status checks `backend (pytest)`, `backend (smoke-import)`, and `frontend (tsc + vite build)` only appear in the dropdown after CI has run for the first time. Open a throwaway PR to trigger them, then go back to the branch protection rule and add the checks.

---

## Verifying it works

Open a PR. The merge button should be greyed out until:

1. CI is green (all required status checks)
2. At least one approving review (if `Require approvals` is set to 1+)
3. All review conversations are resolved
4. The branch is up to date with `main`

If you can merge despite a red check, the rule isn't configured. Go back and re-add the status checks.
