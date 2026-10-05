#!/usr/bin/env python3
"""Extract a docs-drift JSON object from a model response."""

import json
import sys


def is_docs_drift_response(value):
    if not isinstance(value, dict) or set(value) != {"items", "summary"}:
        return False
    if not isinstance(value["items"], list) or not isinstance(value["summary"], str):
        return False

    item_keys = {"doc", "section", "claim", "contradicted_by", "action"}
    for item in value["items"]:
        if not isinstance(item, dict) or set(item) != item_keys:
            return False
        if any(not isinstance(item[key], str) for key in item_keys):
            return False
        if item["action"] not in {"update", "add", "none"}:
            return False
    return True


def parse_response(text):
    decoder = json.JSONDecoder()
    for offset, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[offset:])
        except json.JSONDecodeError:
            continue
        if is_docs_drift_response(value):
            return value
    raise ValueError("No valid docs-drift JSON object found")


try:
    response = parse_response(sys.stdin.read())
except ValueError as error:
    print(error, file=sys.stderr)
    sys.exit(1)

json.dump(response, sys.stdout, separators=(",", ":"))
print()
