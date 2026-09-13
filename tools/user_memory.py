#!/usr/bin/env python3
"""
tools/user_memory.py
CLI tool to query, search, add, and summarize Lex Matondo's structured memory store.

Usage:
    python tools/user_memory.py list [--category CAT] [--importance IMP] [--status STAT]
    python tools/user_memory.py search <query>
    python tools/user_memory.py summary
    python tools/user_memory.py stats
    python tools/user_memory.py add --category CAT --content "..." [--importance high]
"""

import os
import sys
import json
import argparse
from datetime import datetime

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "USER"))

def get_all_json_files():
    json_files = []
    for root, _, files in os.walk(BASE_DIR):
        for f in files:
            if f.endswith(".json"):
                json_files.append(os.path.join(root, f))
    return sorted(json_files)

def load_all_memories():
    all_items = []
    for fpath in get_all_json_files():
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                items = json.load(f)
                if isinstance(items, list):
                    all_items.extend(items)
        except Exception as e:
            print(f"Warning: could not read {fpath}: {e}", file=sys.stderr)
    return all_items

def cmd_list(args):
    items = load_all_memories()
    if args.category:
        items = [i for i in items if i.get("category", "").lower() == args.category.lower()]
    if args.importance:
        items = [i for i in items if i.get("importance", "").lower() == args.importance.lower()]
    if args.status:
        items = [i for i in items if i.get("status", "").lower() == args.status.lower()]

    print(f"\n--- Total Memories Matching: {len(items)} ---")
    for item in items:
        rel = f" [{item['related_project']}]" if item.get("related_project") else ""
        print(f"[{item.get('importance', 'med').upper():4}] ({item.get('category', 'unknown')}) {item.get('id', '???')}: {item.get('content')}{rel}")
    print()

def cmd_search(args):
    query = args.query.lower()
    items = load_all_memories()
    matched = []
    for item in items:
        content = item.get("content", "").lower()
        mid = item.get("id", "").lower()
        cat = item.get("category", "").lower()
        proj = (item.get("related_project") or "").lower()
        if query in content or query in mid or query in cat or query in proj:
            matched.append(item)

    print(f"\n--- Search results for '{args.query}' ({len(matched)} matches) ---")
    for item in matched:
        print(f"• [{item.get('category')}] {item.get('id')}: {item.get('content')} (Status: {item.get('status')}, Importance: {item.get('importance')})")
    print()

def cmd_summary(args):
    items = load_all_memories()
    identities = [f"• {i['content']}" for i in items if i.get("category") == "identity"]
    constraints = [f"• {i['content']}" for i in items if i.get("category") == "hard_constraint"]
    projects = [f"• {i['content']}" for i in items if i.get("category") == "projects" and i.get("status") == "current"]
    habits = [f"• {i['content']}" for i in items if i.get("category") in ("goals", "routines", "fitness") and i.get("importance") == "high"]

    print("=== SEVERUS STRUCTURED USER MEMORY SUMMARY ===")
    print("IDENTITY & REGIONAL CONTEXT:")
    print("\n".join(identities) if identities else "• None recorded")
    print("\nMANDATORY HARD CONSTRAINTS (STRICT):")
    print("\n".join(constraints) if constraints else "• None recorded")
    print("\nACTIVE PROJECTS:")
    print("\n".join(projects) if projects else "• None recorded")
    print("\nPRIMARY HABITS & GOALS:")
    print("\n".join(habits) if habits else "• None recorded")
    print("==============================================")

def cmd_stats(args):
    items = load_all_memories()
    cat_counts = {}
    stat_counts = {}
    imp_counts = {}

    for i in items:
        cat = i.get("category", "unknown")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        st = i.get("status", "unknown")
        stat_counts[st] = stat_counts.get(st, 0) + 1
        imp = i.get("importance", "unknown")
        imp_counts[imp] = imp_counts.get(imp, 0) + 1

    print("\n=== USER MEMORY STORE STATISTICS ===")
    print(f"Total Structured Memories: {len(items)}")
    print("\n[By Category]:")
    for k, v in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  • {k:22}: {v}")
    print("\n[By Status]:")
    for k, v in sorted(stat_counts.items(), key=lambda x: -x[1]):
        print(f"  • {k:22}: {v}")
    print("\n[By Importance]:")
    for k, v in sorted(imp_counts.items(), key=lambda x: -x[1]):
        print(f"  • {k:22}: {v}")
    print("====================================\n")

def main():
    parser = argparse.ArgumentParser(description="Severus Structured Memory CLI")
    subparsers = parser.add_subparsers(dest="command")

    # list
    p_list = subparsers.add_parser("list", help="List memories with optional filters")
    p_list.add_argument("--category", "-c", help="Filter by category")
    p_list.add_argument("--importance", "-i", help="Filter by importance (high, medium, low)")
    p_list.add_argument("--status", "-s", help="Filter by status (current, historical, etc.)")

    # search
    p_search = subparsers.add_parser("search", help="Search memories by keyword")
    p_search.add_argument("query", help="Search query string")

    # summary
    subparsers.add_parser("summary", help="Print prompt grounding summary")

    # stats
    subparsers.add_parser("stats", help="Print statistics breakdown")

    args = parser.parse_args()
    if args.command == "list":
        cmd_list(args)
    elif args.command == "search":
        cmd_search(args)
    elif args.command == "summary":
        cmd_summary(args)
    elif args.command == "stats":
        cmd_stats(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
