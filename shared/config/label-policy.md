---
name: Label Policy
description: Canonical label taxonomy and application rules for all JacobPEvans repositories
---

# Label Policy

Canonical source: `JacobPEvans/.github` at `.github/labels.yml`

## Required Labels (every issue must have all three)

### Type (exactly one)

| Label | Color | When to Apply |
| ------- | ------- | --------------- |
| `type:bug` | `#DC2626` | Something isn't working as expected |
| `type:feature` | `#3B82F6` | New capability or enhancement |
| `type:breaking` | `#7C2D12` | Changes that break existing behavior |
| `type:docs` | `#8B5CF6` | Documentation-only changes |
| `type:chore` | `#64748B` | Maintenance, dependencies, tooling |
| `type:ci` | `#0EA5E9` | CI/CD pipeline changes |
| `type:test` | `#22C55E` | Adding or correcting tests |
| `type:refactor` | `#EAB308` | Code restructuring, no behavior change |
| `type:perf` | `#F97316` | Performance improvements |

### Priority (exactly one)

| Label | Color | Meaning |
| ------- | ------- | --------- |
| `priority:critical` | `#B91C1C` | Immediate attention required |
| `priority:high` | `#EA580C` | Address soon |
| `priority:medium` | `#F59E0B` | Normal workflow |
| `priority:low` | `#059669` | When time permits |

### Size (exactly one)

| Label | Color | Effort |
| ------- | ------- | -------- |
| `size:xs` | `#D1FAE5` | Under 1 hour |
| `size:s` | `#A7F3D0` | 1-4 hours |
| `size:m` | `#6EE7B7` | 1-2 days |
| `size:l` | `#34D399` | 3-5 days |
| `size:xl` | `#047857` | 1+ weeks |

## Workflow Labels

| Label | When to Apply |
| ------- | --------------- |
| `ai:created` | AI-generated issue, needs human approval |
| `ai:ready` | Human-approved, ready for AI implementation |
| `ready-for-dev` | Fully shaped, requirements clear |
| `good-first-issue` | Well-scoped, documented, beginner-friendly |

## Triage Labels

| Label | When to Apply |
| ------- | --------------- |
| `duplicate` | Issue already exists (reference the original) |
| `invalid` | Not a valid issue |
| `wontfix` | Will not be addressed |
| `question` | Needs more information before triaging |

## Application Rules

1. Every issue gets exactly one `type:*`, one `priority:*`, and one `size:*`.
2. Issue form templates enforce priority and size via dropdowns.
3. Type labels are applied by triage (human or automated).
4. Never remove labels set by issue forms.
5. Label names are case-sensitive; use exact names from this policy.
