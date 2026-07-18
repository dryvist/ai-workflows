# Label Sync

Compare the canonical label taxonomy with the requested repositories and write a
structured change verdict. Work read-only: never create, update, or delete labels. A
fresh deterministic publisher validates and applies only missing or drifted canonical
labels.

The canonical label set is `${REPOSITORY_OWNER}/.github:.github/labels.yml`. Requested
targets are `${TARGET_REPOSITORIES}`. When the value is `all`, list non-archived
repositories owned by `${REPOSITORY_OWNER}`; otherwise use only the comma-separated
`owner/repo` names. Compare each target's current labels with the canonical definitions.
Leave extra repository-specific labels alone and skip archived repositories.

Write `.label-sync.json` in the repository root with only missing or drifted labels:

```json
{
  "repositories": [
    {
      "name": "${REPOSITORY_OWNER}/example",
      "labels": [
        {"name": "type:bug", "color": "d73a4a", "description": "Something is not working"}
      ]
    }
  ]
}
```

Colors must be six hexadecimal characters without `#`. Descriptions must be at most 100
characters. Include at most 200 repositories and 100 labels per repository. Do not
include unchanged or extra labels, duplicate names, repositories outside
`${REPOSITORY_OWNER}`, or any additional fields. Write `{"repositories": []}` when
everything is synchronized. Output valid JSON and do not edit any other file.
