#!/usr/bin/env python3
"""
Severus Directive Linter (P2)
Scans AGENTS.md, .agents/rules/, ~/.gemini/config/rules/, and ~/.gemini/config/skills/ or ~/.agents/skills/.
Extracts MUST / NEVER / ALWAYS clauses and detects:
1. Exact duplicate rule clauses across files.
2. Semantic contradictions (e.g. MUST X vs NEVER X on identical subject).
3. Orphan rule files lacking [[wiki-link]] nodes linking to Second Brain knowledge graph.
"""

import os
import re
import sys
from pathlib import Path

ROOTS = [
    Path("C:/Users/User/Documents/Severus/AGENTS.md"),
    Path("C:/Users/User/Documents/Severus/.agents/rules"),
    Path("C:/Users/User/.gemini/config/rules"),
    Path("C:/Users/User/.gemini/config/skills"),
    Path("C:/Users/User/.agents/skills"),
]

RULE_CLAUSE_REGEX = re.compile(r"\b(MUST|NEVER|ALWAYS)\b", re.IGNORECASE)
WIKI_LINK_REGEX = re.compile(r"\[\[([^\]]+)\]\]")

STOP_WORDS = {"the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "are", "be", "this", "that", "it", "run", "read", "use", "only", "ask", "user", "question", "preview"}

def collect_rule_files():
    files = []
    for root in ROOTS:
        if root.is_file():
            files.append(root)
        elif root.is_dir():
            for p in root.rglob("*.md"):
                files.append(p)
    return sorted(list(set(files)))

def extract_subject(line_lower):
    cleaned = re.sub(r"^[^a-z0-9]+", "", line_lower)
    m = re.search(r"\b(must|never|always)\b", cleaned)
    if m:
        after_kw = cleaned[m.end():].strip(" :-\t")
        words = [w for w in re.findall(r"\b[a-z0-9]+\b", after_kw) if w not in STOP_WORDS and len(w) > 2]
        return " ".join(words[:2]) # 2 key domain subject words
    return ""

def lint_directives():
    rule_files = collect_rule_files()
    duplicates = []
    contradictions = []
    orphans = []

    seen_clauses = {}
    subject_map = {}

    for filepath in rule_files:
        try:
            content = filepath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Check for orphan (no [[wiki-link]])
        has_wiki_link = bool(WIKI_LINK_REGEX.search(content))
        if not has_wiki_link:
            orphans.append(str(filepath))

        # Extract clauses
        for line_num, line in enumerate(content.splitlines(), 1):
            if RULE_CLAUSE_REGEX.search(line):
                clean_clause = line.strip("- *#\t")
                norm_text = clean_clause.lower()
                
                # Check exact duplicate
                if norm_text in seen_clauses:
                    duplicates.append({
                        "clause": clean_clause,
                        "file1": seen_clauses[norm_text],
                        "file2": f"{filepath}:{line_num}"
                    })
                else:
                    seen_clauses[norm_text] = f"{filepath}:{line_num}"

                # Contradiction Subject extraction
                kw_match = re.search(r"\b(must|never|always)\b", norm_text)
                if kw_match:
                    kw = kw_match.group(1).lower()
                    subj = extract_subject(norm_text)
                    if subj and len(subj.split()) >= 2:
                        subject_map.setdefault(subj, []).append({
                            "kw": kw,
                            "clause": clean_clause,
                            "location": f"{filepath}:{line_num}"
                        })

    # Detect contradictions on identical 2-word subject
    for subj, items in subject_map.items():
        if len(items) > 1:
            kws = {it["kw"] for it in items}
            if ("never" in kws and ("must" in kws or "always" in kws)):
                contradictions.append({
                    "subject": subj,
                    "items": items
                })

    print(f"\n=== SEVERUS DIRECTIVE LINTER REPORT ===")
    print(f"Parsed {len(rule_files)} rule and skill definition files.")
    print(f"Extracted {len(seen_clauses)} unique directive clauses.")

    print(f"\n--- 1. DUPLICATE DIRECTIVES ({len(duplicates)}) ---")
    for d in duplicates[:5]:
        print(f"  [DUP] '{d['clause'][:60]}...'")
        print(f"        Original: {d['file1']} | Secondary: {d['file2']}")

    print(f"\n--- 2. SEMANTIC CONTRADICTIONS ({len(contradictions)}) ---")
    for c in contradictions:
        print(f"  [CONTRADICTION] Subject: '{c['subject']}'")
        for it in c["items"]:
            print(f"        -> [{it['kw'].upper()}] {it['location']}: {it['clause'][:70]}")

    print(f"\n--- 3. ORPHAN RULE/SKILL FILES (NO [[WIKI-LINK]]) ({len(orphans)}) ---")
    for o in orphans[:5]:
        print(f"  [ORPHAN] {o}")
    if len(orphans) > 5:
        print(f"  ... and {len(orphans) - 5} more orphan skill/rule files.")

    has_critical_error = len(contradictions) > 0
    if has_critical_error:
        print("\n=== LINTER FAIL - SEMANTIC CONTRADICTION DETECTED ===")
        sys.exit(1)
    else:
        print("\n=== LINTER PASS - CLEAN DIRECTIVE SET ===")
        sys.exit(0)

if __name__ == "__main__":
    lint_directives()
