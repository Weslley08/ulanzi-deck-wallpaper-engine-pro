# CMR + RTK benchmark — Wallpaper Engine PRO

The user starts with **33% remaining of Claude Pro's weekly limit**. This is a user-observed account quota, not an API token allocation. Do **not** convert 1 percentage point into a specific number of tokens.

## Principle

Work on an actual project, but **only one constrained deliverable at a time**. A huge request tends to drive Opus and makes comparison impossible. Stop Phase 1 if weekly remaining quota reaches **28%**, or if repeated failures cause unbounded retries. Reserve the remaining weekly capacity for other work.

### Before Phase 1 (in a fresh Claude Code session)

1. Update `model-router@cmr` (version 0.2.1 or later), reload the plugin.
2. Open this repo and run `/cmr mode balanced`, `/cmr force none`, `/cmr auto`, `/cmr stats`.
3. Capture account **weekly** remaining percentage and reset time from Claude's usage screen, if visible.
4. Run `powershell -NoProfile -File scripts/benchmark.ps1 -Stage before` in this repo.
5. Avoid parallel RTK sessions that could contaminate the global history.

### During Phase 1

- Send one scoped request referencing `docs/PHASE-1.md`, not an unbounded "build everything" instruction.
- After each meaningful deliverable, record `/cmr stats` and the current weekly percentage.
- Verify tests with `npm run check`. RTK intercepts compatible **Bash** tools, not arbitrary PowerShell commands.
- Keep RTK enabled throughout the comparison.
- Document unexpected switching, model errors or high cache churn.

### After Phase 1

1. Run `/cmr stats` and `/cmr status`.
2. Run `powershell -NoProfile -File scripts/benchmark.ps1 -Stage after`.
3. Record weekly remaining percentage. Save a sanitized text copy of CMR stats (don't commit private sessions).
4. Inspect `benchmark-data/rtk-delta.json` and `benchmark-data/rtk-delta.txt`.

## Interpretation

| Metric | Evidence | Limitation |
|---|---|---|
| RTK raw vs compacted output | `rtk gain` before/after deltas | Estimated Bash output tokens, **not total Claude quota** |
| CMR selected families | `/cmr stats` selected aliases | Does not prove provider executed selected family |
| CMR confirmed families | `/cmr stats` provider-reported | `unverified` remains unknown |
| Input/output/cache | Claude Code per-session stats | Cache can be affected by model switching |
| Claude Pro 33% baseline | Weekly quota percentage screenshots | Nonlinear; refreshed periodically; not comparable to raw tokens |
| Quality | Tests, lint, manual device checks, rework | Savings are not useful if implementation regresses |

This first run **observes** CMR+RTK, not causal savings. A later comparison of two small equivalent tasks, one on balanced CMR and one on a fixed Sonnet model, with RTK enabled in both, can isolate the routing effect better. Never consume most of a weekly quota to "prove" savings.

## Output files (ignored by Git)

`benchmark-data/rtk-before.json`, `rtk-after.json`, `rtk-delta.json`, `rtk-delta.txt`.

Do not commit Claude conversation logs, paths to wallpapers or account usage screenshots containing personal information.
