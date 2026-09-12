#!/usr/bin/env python3
"""Second Brain graph builder.

Parses markdown notes (with #tags and [[wiki-links]]) into a weighted graph, ranks it with
PageRank, computes freshness decay from file mtimes, and renders an interactive 3D graph to
graph.html. Standard library only — no dependencies to install.
"""

import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

BRAIN_DIR = Path(__file__).resolve().parent
NOTES_DIR = BRAIN_DIR / "notes"
OUTPUT = BRAIN_DIR / "graph.html"

HALF_LIFE_DAYS = 45.0      # a note's brightness halves roughly every 45 days
SHARED_TAG_WEIGHT = 0.3    # notes sharing a tag are weakly related
WIKI_LINK_WEIGHT = 1.0
DAMPING = 0.85
ITERATIONS = 100
BACKGROUND = (0x0B, 0x0E, 0x14)
PALETTE = ["#4f8ef7", "#f75f8e", "#4ff7a8", "#f7c94f", "#b44ff7", "#f78a4f"]

WIKI_LINK = re.compile(r"\[\[([^\]]+)\]\]")
TAG = re.compile(r"(?<!\w)#([A-Za-z][A-Za-z0-9_-]*)")
HEADING = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def parse_note(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    heading = HEADING.search(text)
    title = heading.group(1).strip() if heading else path.stem
    tags = sorted({t.lower() for t in TAG.findall(text)})
    links = [link.strip() for link in WIKI_LINK.findall(text)]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip() and not p.strip().startswith("#")]
    excerpt = ""
    if paragraphs:
        first = re.sub(r"\[\[([^\]]+)\]\]", r"\1", paragraphs[0])
        first = re.sub(r"#([A-Za-z][A-Za-z0-9_-]*)", r"\1", first)
        first = re.sub(r"\*+", "", first)
        excerpt = first[:220] + ("…" if len(first) > 220 else "")
    return {"id": path.stem, "title": title, "tags": tags, "links": links, "excerpt": excerpt}


def build_edges(notes: list[dict]) -> dict:
    by_id = {n["id"].lower(): n["id"] for n in notes}
    edges: dict[tuple[str, str], float] = {}

    def add(source: str, target: str, weight: float) -> None:
        if source == target:
            return
        key = (source, target)
        edges[key] = max(edges.get(key, 0.0), weight)

    for note in notes:
        for link in note["links"]:
            target = by_id.get(link.lower())
            if target:
                add(note["id"], target, WIKI_LINK_WEIGHT)
    for i, a in enumerate(notes):
        for b in notes[i + 1:]:
            if set(a["tags"]) & set(b["tags"]):
                add(a["id"], b["id"], SHARED_TAG_WEIGHT)
                add(b["id"], a["id"], SHARED_TAG_WEIGHT)
    return edges


def pagerank(nodes: list[str], edges: dict, damping: float = DAMPING, iterations: int = ITERATIONS) -> dict:
    out_weight = {n: 0.0 for n in nodes}
    for (a, _), w in edges.items():
        out_weight[a] += w

    count = len(nodes)
    ranks = {n: 1.0 / count for n in nodes}
    for _ in range(iterations):
        dangling = sum(r for n, r in ranks.items() if out_weight[n] == 0.0)
        new = {n: (1 - damping) / count + damping * dangling / count for n in nodes}
        for (a, b), w in edges.items():
            new[b] += damping * ranks[a] * (w / out_weight[a])
        ranks = new
    return ranks


def fade(hex_color: str, opacity: float) -> str:
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    mixed = (round(c * opacity + bg * (1 - opacity)) for c, bg in zip((r, g, b), BACKGROUND))
    return "#{:02x}{:02x}{:02x}".format(*mixed)


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Second Brain</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0e14; color: #d7dce5;
    font-family: "Segoe UI", system-ui, sans-serif; overflow: hidden; }
  #graph { position: absolute; inset: 0; }
  header { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 14px 20px;
    background: linear-gradient(#0b0e14ee, #0b0e1400); pointer-events: none; }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: .4px; }
  header p { margin: 3px 0 0; font-size: 12px; color: #8b94a3; }
  #tags { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10;
    display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 90vw; }
  #tags button { background: #161b24; border: 1px solid #2a3140; color: #cdd5e0;
    border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  #tags button.off { opacity: .35; text-decoration: line-through; }
  #panel { position: fixed; top: 70px; right: 16px; width: 300px; max-width: 85vw; z-index: 10;
    background: #12161f; border: 1px solid #2a3140; border-radius: 10px; padding: 14px 16px;
    display: none; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
  #panel h2 { margin: 0 0 6px; font-size: 15px; padding-right: 16px; }
  #panel .meta { font-size: 11px; color: #8b94a3; margin-bottom: 8px; }
  #panel .body { font-size: 12.5px; line-height: 1.5; color: #b9c2cf; }
  #panel .x { position: absolute; top: 8px; right: 10px; cursor: pointer; color: #8b94a3; }
</style>
</head>
<body>
<div id="graph"></div>
<header>
  <h1>Second Brain</h1>
  <p>size = PageRank importance &middot; brightness = freshness (older notes decay) &middot;
     click a node for details &middot; click tags below to filter</p>
</header>
<div id="tags"></div>
<div id="panel">
  <span class="x" onclick="document.getElementById('panel').style.display='none'">&#10005;</span>
  <h2 id="p-title"></h2><div class="meta" id="p-meta"></div><div class="body" id="p-body"></div>
</div>
<div id="fallback" style="display:none; position:fixed; inset:0; padding:40px; z-index:20;">
  Could not load the 3D graph library (CDN unreachable). This page needs internet access on first load.
</div>
<script src="vendor/3d-force-graph.min.js"></script>
<script>if (!window.ForceGraph3D) document.write('<script src="https://unpkg.com/3d-force-graph@1.73.0/dist/3d-force-graph.min.js"><\/script>');</script>
<script>
const DATA = __DATA__;
const byId = Object.fromEntries(DATA.nodes.map(n => [n.id, n]));
const allTags = Object.keys(DATA.tags);
const active = new Set(allTags);

const tagsBox = document.getElementById('tags');
for (const t of allTags) {
  const b = document.createElement('button');
  b.textContent = '#' + t;
  b.style.borderColor = DATA.tags[t];
  b.onclick = () => {
    active.has(t) ? active.delete(t) : active.add(t);
    b.classList.toggle('off');
    refresh();
  };
  tagsBox.appendChild(b);
}

const visible = n => n.tags.length === 0 || n.tags.some(t => active.has(t));
const nid = o => (typeof o === 'string') ? o : o.id;
const visibleLink = l => visible(byId[nid(l.source)]) && visible(byId[nid(l.target)]);

if (!window.ForceGraph3D) {
  document.getElementById('fallback').style.display = 'block';
} else {
  const graph = ForceGraph3D()(document.getElementById('graph'))
    .backgroundColor('#0b0e14')
    .nodeRelSize(2)
    .nodeLabel(n => '<span style="background:#12161fee;padding:4px 10px;border-radius:6px;'
      + 'border:1px solid #2a3140">' + n.title + '</span>')
    .nodeVal(n => visible(n) ? n.size : 0.001)
    .nodeColor(n => visible(n) ? n.color : 'rgba(0,0,0,0)')
    .linkColor(l => visibleLink(l) ? 'rgba(150,165,190,0.22)' : 'rgba(0,0,0,0)')
    .linkWidth(l => visibleLink(l) ? 0.3 + l.weight : 0)
    .linkOpacity(0.35)
    .onNodeClick(n => {
      document.getElementById('p-title').textContent = n.title;
      document.getElementById('p-meta').textContent =
        'importance ' + n.importance + '% · age ' + n.ageDays + ' days · #'
        + n.tags.join(' #');
      document.getElementById('p-body').textContent = n.excerpt || '(no preview)';
      document.getElementById('panel').style.display = 'block';
    });
  graph.graphData(DATA);
  graph.d3Force('charge').strength(-400);
  window.graph = graph;
  graph.onEngineStop(() => graph.zoomToFit(600, 120));

  function refresh() {
    graph.nodeColor(graph.nodeColor()).nodeVal(graph.nodeVal())
         .linkColor(graph.linkColor()).linkWidth(graph.linkWidth());
  }
  refresh();
  window.addEventListener('resize', () => graph.width(window.innerWidth).height(window.innerHeight));
}

// Live reload: when served by app.py, a note change bumps /version and the page refreshes.
// Opened as a plain file, the fetch fails silently and the page stays static.
let knownVersion = null;
setInterval(async () => {
  try {
    const r = await fetch('version', { cache: 'no-store' });
    if (!r.ok) return;
    const v = await r.text();
    if (knownVersion === null) { knownVersion = v; return; }
    if (v !== knownVersion) location.reload();
  } catch (e) { /* no server — static mode */ }
}, 3000);
</script>
</body>
</html>
"""


def build() -> dict:
    """Parse notes, rank the graph, and write graph.html. Returns a summary."""
    paths = sorted(NOTES_DIR.glob("*.md"))
    if not paths:
        raise RuntimeError(f"No notes found in {NOTES_DIR}")

    notes = [parse_note(p) for p in paths]
    edges = build_edges(notes)
    ranks = pagerank([n["id"] for n in notes], edges)
    total_rank = sum(ranks.values()) or 1.0
    max_rank = max(ranks.values()) or 1.0

    all_tags = sorted({t for n in notes for t in n["tags"]})
    tag_color = {t: PALETTE[i % len(PALETTE)] for i, t in enumerate(all_tags)}
    now = time.time()

    nodes = []
    for note, path in zip(notes, paths):
        age_days = max(0.0, (now - path.stat().st_mtime) / 86400)
        opacity = 0.3 + 0.7 * math.exp(-age_days / HALF_LIFE_DAYS)
        primary = note["tags"][0] if note["tags"] else None
        nodes.append({
            "id": note["id"],
            "title": note["title"],
            "tags": note["tags"],
            "excerpt": note["excerpt"],
            "importance": round(ranks[note["id"]] / total_rank * 100, 2),
            "size": round(2 + 22 * (ranks[note["id"]] / max_rank) ** 0.7, 2),
            "ageDays": round(age_days, 1),
            "color": fade(tag_color.get(primary, "#9aa4b2"), opacity),
        })

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "nodes": nodes,
        "links": [{"source": a, "target": b, "weight": round(w, 2)} for (a, b), w in edges.items()],
        "tags": {t: tag_color[t] for t in all_tags},
    }
    data_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    OUTPUT.write_text(TEMPLATE.replace("__DATA__", data_json), encoding="utf-8")
    return {
        "notes": len(nodes),
        "links": len(payload["links"]),
        "tags": all_tags,
        "ranking": [(n["importance"], n["title"]) for n in sorted(nodes, key=lambda n: -n["importance"])],
        "output": str(OUTPUT),
    }


def main() -> None:
    try:
        info = build()
    except RuntimeError as exc:
        raise SystemExit(str(exc))
    print(f"Wrote {info['output']}")
    print(f"  {info['notes']} notes, {info['links']} links, tags: {', '.join(info['tags']) or '(none)'}")
    for importance, title in info["ranking"]:
        print(f"  {importance:5.1f}%  {title}")


if __name__ == "__main__":
    main()
