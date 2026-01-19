#!/usr/bin/env python3
import json
import sys


def main():
    if len(sys.argv) != 2:
        print("Usage: inspect_tx_debug.py <tx.debug.json>")
        return 2
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    tx = data["tx"]["tx"]
    operations = tx["operations"]
    unique_names = {op["body"]["manage_data"]["data_name"] for op in operations}
    print("ops", len(operations))
    print("unique_names", len(unique_names))
    print("fee", tx["fee"])
    print("source", tx["source_account"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
