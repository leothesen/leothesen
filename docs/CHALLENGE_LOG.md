# Challenge log

Framing challenges raised before or during substantive work, and what came of
them. See the `/challenge` skill.

---

## 2026-09-09 — "Stop the sync PRs that only change `synced_at`"

**Test that fired:** MECHANISM. The ask named a mechanism (update the
`synced_at` field) rather than an outcome.

**Outcome restated:** Leo stops getting daily noise from the Notion content
sync, *and* the sync actually keeps leothesen.com's content current.

**The case that this was the wrong problem:**

Suppressing the `syncedAt` bump treats a symptom of a pipeline that is already
dead. The pull requests Leo was annoyed by stopped arriving four months ago:
the last one is #78, dated 2026-05-07. What actually lands in his inbox now is a
daily *failure* notification from a workflow that has not completed a successful
sync since then. Deduplicating the manifest write would have been the right fix
in April; on its own, today, it repairs a code path that never executes. Ship
only that and the daily email keeps arriving, the site keeps serving four-month-
old Notion content, and the change looks like it worked — because the PR noise
had already stopped for an unrelated reason. The real problem was an unpinned
`pnpm` version in CI (`version: latest`, which has since floated from 10 to
12.3.4, where `ERR_PNPM_IGNORED_BUILDS` became fatal) breaking the pipeline with
no repo change, and nothing distinguishing "sync is quiet because nothing
changed" from "sync is quiet because it is broken".

**Resolution:** Did both, root cause first. Pinned the toolchain via
`packageManager` so CI cannot float again, declared `onlyBuiltDependencies` to
clear the hard failure, *then* made `writeManifest` stamp `syncedAt` only on a
real content change — because once the sync runs again, the daily noise PR comes
straight back.

**Still open:** the 14 stale `sync/notion-*` PRs (#65–#78) are unreviewed noise
and should be closed; nothing distinguishes a quiet sync from a broken one.

---

## 2026-09-12 — "Write comprehensive tests, and run them when a PR opens"

**Test that fired:** MECHANISM. The ask named a mechanism (write tests, run
them on pull requests) rather than an outcome.

**Outcome restated:** No change to leothesen.com, whether code or the daily
Notion content, reaches the live site broken without a red signal first.

**The case that this was the wrong problem:**

Tests already existed and already ran on every pull request: `build.yml` has
run `pnpm test` on `pull_request` all along. Writing more of them does nothing
about the two places that signal was actually missing. First, the daily content
PRs, the most frequent PRs this repo gets and the ones the content-integrity
tests exist for, ran no tests at all. GitHub holds workflows on a PR opened by
`github-actions[bot]` as `action_required`, and every sync PR in September sat
that way until it was re-run by hand. Second, a red check blocked nothing,
because the `main` ruleset requires no status checks. And the site's real
breakages this year were not pure-function bugs a unit test would catch. They
were rendered-output failures: cross-links 404ing after renames, a raw
`/<uuid>` link to an unsynced page, blurred images, analytics dark for six
months. A few hundred unit tests over lib/ would have caught none of them.

**Resolution:** Built the suite around rendered output rather than around
functions. Every committed page is rendered and link-checked in the unit job,
and the E2E job crawls every page and every internal link on a real production
server. Fixed the plumbing too: the sync now dispatches CI on its own PRs, and
PR branches stop running CI twice. The unit layer still covers the resolver,
renderer, routes and config, since those are where a code change breaks those
outputs.

**Still open:** making the checks *required* is a repository setting, not a
file, and was left to Leo. Until it is set, a red run still merges. The
workflow_dispatch path for sync PRs is verified by mechanism, not yet
end-to-end on a real scheduled sync.
