# AI Provenance Footer (Canonical Reference)

All PR-creating prompts must include this footer at the bottom of the PR body.

## Format

```markdown
---
> **AI Provenance** | Workflow: `${WORKFLOW_NAME}` | [Run ${RUN_ID}](${RUN_URL}) | Event: `${EVENT_NAME}` | Actor: `${TRIGGER_ACTOR}`
```

## Variables

| Variable | Source | Description |
| ---------- | -------- | ------------- |
| `WORKFLOW_NAME` | `github.workflow` | Name of the calling workflow |
| `RUN_ID` | `github.run_id` | Numeric run ID |
| `RUN_URL` | Constructed from `github.server_url`, `github.repository`, `github.run_id` | Link to workflow run |
| `EVENT_NAME` | `github.event_name` | Event that triggered the workflow |
| `TRIGGER_ACTOR` | `github.triggering_actor` | GitHub username that triggered the run |

## Notes

- The `---` separator creates a visual divider before the footer
- Variables are substituted at render time via `render-prompt.sh` + `envsubst`
- For `ci-fix.md`, provenance is added to the commit message instead of PR body
