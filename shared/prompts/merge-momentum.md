---
name: Merge Momentum
description: Reusable rules for detecting development direction and identifying gaps from merge history
---

# Merge Momentum Rules

Guidelines for analyzing merged PRs to detect development patterns and find gaps.

## Direction Categories

| Direction | Signals |
| ----------- | --------- |
| Area expansion | New files, new modules, new directories, feature-prefixed branches |
| Reliability push | Bug fixes, error handling, retry logic, validation additions |
| Documentation sprint | README changes, comment additions, guide files, example updates |
| Infrastructure improvement | CI/CD changes, dependency updates, tooling config, build scripts |
| Maintenance cycle | File deletions, renames, code movement, deprecation removal |

## Gap Patterns

Look for these common incomplete patterns:

| Recent Change | Missing Counterpart |
| --------------- | ------------------- |
| New feature code | Tests for that feature |
| New config option | Documentation of that option |
| New module/component | Integration with existing entry points |
| Renamed file/variable | Updated references in other files |
| New dependency | Lock file update, version constraint |
| New workflow | README entry, pattern documentation |

## Momentum Rules

1. **Follow the thread**: If the last 3+ PRs touch the same area, the next step should
   continue that area unless a gap exists.
2. **Fill gaps first**: An incomplete follow-through from recent work takes priority over
   continuing the current direction.
3. **One step ahead**: Suggest what naturally comes next, not a leap to something unrelated.
4. **Respect the pause**: If development paused (no merges in 3+ days), the next step
   should be small and re-establishing rather than ambitious.
