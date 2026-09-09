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
