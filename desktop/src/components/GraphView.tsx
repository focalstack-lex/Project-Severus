import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "3d-force-graph";
import Icon from "./Icon";
import type { GraphLink } from "../types";

export interface VisNode {
  id: string;
  title: string;
  tags: string[];
  excerpt: string;
  importance: number;
  size: number;
  ageDays: number;
  color: string;
}

interface Props {
  nodes: VisNode[];
  links: GraphLink[];
  activeTags: Set<string>;
  selectedId?: string | null;
  onSelectNote: (id: string) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GraphInstance = any;

interface Point {
  x: number;
  y: number;
}

/**
 * Deterministic force-directed layout (repulsion + link springs + centering),
 * seeded on a ring so the same vault always produces the same map. Computed
 * over ALL nodes so toggling tag filters never reshuffles the layout.
 */
function computeLayout(nodes: VisNode[], links: GraphLink[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  const n = nodes.length;
  if (n === 0) return positions;

  nodes.forEach((node, idx) => {
    const angle = (idx / n) * 2 * Math.PI;
    positions.set(node.id, {
      x: Math.cos(angle) * 180,
      y: Math.sin(angle) * 180,
    });
  });

  const REPULSION = 130 * 130;
  const REST_LENGTH = 155;
  const SPRING = 0.018;
  const GRAVITY = 0.004;
  const ITERATIONS = 160;

  const linkedPairs = links
    .map((l) => ({
      a: positions.get(typeof l.source === "string" ? l.source : (l.source as any)?.id),
      b: positions.get(typeof l.target === "string" ? l.target : (l.target as any)?.id),
    }))
    .filter((p): p is { a: Point; b: Point } => Boolean(p.a && p.b));

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    const cooling = 1 - iter / ITERATIONS;

    for (let i = 0; i < n; i += 1) {
      const a = positions.get(nodes[i].id)!;
      for (let j = i + 1; j < n; j += 1) {
        const b = positions.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) {
          dx = (i - j) * 0.7 + 0.3;
          dy = (j - i) * 0.5 + 0.3;
          dist = Math.hypot(dx, dy);
        }
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.x += fx * cooling;
        a.y += fy * cooling;
        b.x -= fx * cooling;
        b.y -= fy * cooling;
      }
    }

    for (const pair of linkedPairs) {
      const dx = pair.b.x - pair.a.x;
      const dy = pair.b.y - pair.a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const force = (dist - REST_LENGTH) * SPRING;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      pair.a.x += fx * cooling;
      pair.a.y += fy * cooling;
      pair.b.x -= fx * cooling;
      pair.b.y -= fy * cooling;
    }

    for (const node of nodes) {
      const p = positions.get(node.id)!;
      p.x -= p.x * GRAVITY;
      p.y -= p.y * GRAVITY;
    }
  }

  return positions;
}

export default function GraphView({
  nodes,
  links,
  activeTags,
  selectedId,
  onSelectNote,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<GraphInstance>(null);
  const [graphMode, setGraphMode] = useState<"2d" | "3d">("2d");
  const [failed, setFailed] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);

  const activeRef = useRef(activeTags);
  activeRef.current = activeTags;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const tagsByIdRef = useRef<Map<string, string[]>>(new Map());
  const selectRef = useRef(onSelectNote);
  selectRef.current = onSelectNote;

  useEffect(() => {
    tagsByIdRef.current = new Map(nodes.map((n) => [n.id, n.tags]));
  }, [nodes]);

  const layout = useMemo(() => computeLayout(nodes, links), [nodes, links]);

  const tagSwatches = useMemo(() => {
    const byTag = new Map<string, string>();
    for (const node of nodes) {
      const tag = node.tags[0];
      if (tag && !byTag.has(tag)) byTag.set(tag, node.color);
    }
    return Array.from(byTag.entries()).slice(0, 6);
  }, [nodes]);

  const nodeVisible = (id: string): boolean => {
    const tags = tagsByIdRef.current.get(id);
    return !tags || tags.length === 0 || tags.some((tag) => activeRef.current.has(tag));
  };

  const linkVisible = (link: { source: unknown; target: unknown }): boolean => {
    const sourceId =
      typeof link.source === "string" ? link.source : (link.source as { id?: string })?.id;
    const targetId =
      typeof link.target === "string" ? link.target : (link.target as { id?: string })?.id;
    return nodeVisible(sourceId ?? "") && nodeVisible(targetId ?? "");
  };

  // 3D topology
  useEffect(() => {
    if (graphMode !== "3d") return;
    const container = containerRef.current;
    if (!container) return;
    let instance: GraphInstance = null;
    let ro: ResizeObserver | null = null;

    try {
      const fg = new ForceGraph3D(container);
      fg.backgroundColor("#050505")
        .showNavInfo(false)
        .nodeRelSize(3)
        .nodeLabel((node: unknown) => {
          const n = node as VisNode;
          const tagList = n.tags && n.tags.length > 0 ? `#${n.tags.join(" #")}` : "";
          return `<div class="node-label"><strong>${n.title ?? ""}</strong><span>${tagList}</span></div>`;
        })
        .onNodeClick((node: unknown) => {
          const id = (node as VisNode).id;
          if (typeof id === "string") selectRef.current(id);
        })
        .linkVisibility((link: unknown) => linkVisible(link as { source: unknown; target: unknown }))
        .linkOpacity(0.22);

      const charge = (fg as unknown as { d3Force?: (key: string) => unknown }).d3Force?.(
        "charge",
      ) as { strength?: (value: number) => unknown } | undefined;
      charge?.strength?.(-350);

      fg.onEngineStop(() => fg.zoomToFit(500, 100));
      instance = fg;
      fgRef.current = fg;

      ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          fg.width(container.clientWidth);
          fg.height(container.clientHeight);
        }
      });
      ro.observe(container);
    } catch {
      setFailed(true);
    }

    return () => {
      ro?.disconnect();
      try {
        instance?._destructor?.();
      } catch {
        // destructor already torn down
      }
      fgRef.current = null;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode]);

  useEffect(() => {
    if (graphMode !== "3d" || !fgRef.current) return;
    fgRef.current.graphData({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });
  }, [nodes, links, graphMode]);

  // 2D canvas map
  const canvas2DRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (graphMode !== "2d") return;
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let panX = 0;
    let panY = 0;
    let zoom = 1;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let didDrag = false;

    const visibleNodes = nodes.filter((n) => nodeVisible(n.id));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = links.filter((l) => {
      const src = typeof l.source === "string" ? l.source : (l.source as any)?.id;
      const tgt = typeof l.target === "string" ? l.target : (l.target as any)?.id;
      return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
    });

    let cssWidth = canvas.clientWidth || 800;
    let cssHeight = canvas.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;

    const updateDimensions = () => {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        cssWidth = canvas.clientWidth;
        cssHeight = canvas.clientHeight;
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
    };
    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
    });
    ro.observe(canvas);

    const render = () => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      ctx.translate(cssWidth / 2 + panX, cssHeight / 2 + panY);
      ctx.scale(zoom, zoom);

      // Links
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1 / zoom;
      for (const l of visibleLinks) {
        const srcId = typeof l.source === "string" ? l.source : (l.source as any)?.id;
        const tgtId = typeof l.target === "string" ? l.target : (l.target as any)?.id;
        const p1 = layout.get(srcId);
        const p2 = layout.get(tgtId);
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // Nodes
      for (const n of visibleNodes) {
        const pos = layout.get(n.id);
        if (!pos) continue;

        const isSelected = Boolean(selectedId) && n.id.toLowerCase() === (selectedId ?? "").toLowerCase();
        const nodeRadius = Math.max(6, Math.min(20, n.size * 1.6));

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? "#ffffff" : n.color || "#8f98a3";
        ctx.fill();

        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = (isSelected ? 1.5 : 1) / zoom;
        ctx.stroke();

        // Crisp selection ring — no blur halo
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, nodeRadius + 4, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
          ctx.lineWidth = 1.25 / zoom;
          ctx.stroke();
        }

        if (zoom >= 0.65) {
          ctx.font = "500 11px Geist, Inter, -apple-system, sans-serif";
          ctx.fillStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.78)";
          ctx.textAlign = "center";
          ctx.fillText(n.title, pos.x, pos.y + nodeRadius + 15);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    const getCanvasMousePos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left - (cssWidth / 2 + panX);
      const rawY = e.clientY - rect.top - (cssHeight / 2 + panY);
      return { x: rawX / zoom, y: rawY / zoom };
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      didDrag = false;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const nextPanX = e.clientX - dragStartX;
        const nextPanY = e.clientY - dragStartY;
        if (Math.hypot(nextPanX - panX, nextPanY - panY) > 4) {
          didDrag = true;
        }
        panX = nextPanX;
        panY = nextPanY;
      } else {
        const mouse = getCanvasMousePos(e);
        const hit = visibleNodes.some((n) => {
          const pos = layout.get(n.id);
          if (!pos) return false;
          const nodeRadius = Math.max(6, Math.min(20, n.size * 1.6));
          // hit-test in screen space so it stays consistent across zoom levels
          return Math.hypot(mouse.x - pos.x, mouse.y - pos.y) * zoom <= nodeRadius + 5;
        });
        canvas.style.cursor = hit ? "pointer" : "grab";
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!didDrag) {
        const mouse = getCanvasMousePos(e);
        for (const n of visibleNodes) {
          const pos = layout.get(n.id);
          if (!pos) continue;
          const nodeRadius = Math.max(6, Math.min(20, n.size * 1.6));
          if (Math.hypot(mouse.x - pos.x, mouse.y - pos.y) * zoom <= nodeRadius + 5) {
            onSelectNote(n.id);
            break;
          }
        }
      }
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoom = Math.max(0.4, Math.min(3.5, zoom * zoomFactor));
    };

    const handleDoubleClick = () => {
      panX = 0;
      panY = 0;
      zoom = 1;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("dblclick", handleDoubleClick);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("dblclick", handleDoubleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode, nodes, links, activeTags, selectedId, onSelectNote, layout]);

  const handleResetCamera = () => {
    if (graphMode === "3d" && fgRef.current) {
      fgRef.current.zoomToFit(500, 100);
    }
  };

  return (
    <div className="graph-pane-inner">
      <div className="graph-toolbar">
        <div className="graph-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${graphMode === "2d" ? "active" : ""}`}
            onClick={() => setGraphMode("2d")}
          >
            2D Map
          </button>
          <button
            type="button"
            className={`mode-btn ${graphMode === "3d" ? "active" : ""}`}
            onClick={() => setGraphMode("3d")}
          >
            3D Topology
          </button>
        </div>

        <span className="graph-count-badge">
          {nodes.length} nodes · {links.length} links
        </span>
      </div>

      {graphMode === "3d" ? (
        <div ref={containerRef} className="graph-container mode-3d" />
      ) : (
        <canvas ref={canvas2DRef} className="graph-container mode-2d" />
      )}

      <div className={`graph-hud ${hudOpen ? "open" : "collapsed"}`}>
        <div className="graph-hud-bar">
          <button
            type="button"
            className="graph-hud-btn"
            onClick={() => setHudOpen((prev) => !prev)}
            title="Toggle graph legend"
          >
            <span className="hud-icon">
              <Icon name={hudOpen ? "close" : "info"} size={13} />
            </span>
            <span>{hudOpen ? "Close" : "Legend"}</span>
          </button>
          {graphMode === "3d" && (
            <button
              type="button"
              className="graph-hud-btn icon-only"
              onClick={handleResetCamera}
              title="Reset camera"
              aria-label="Reset camera"
            >
              <Icon name="reset" size={13} />
            </button>
          )}
        </div>

        {hudOpen && (
          <div className="graph-hud-card">
            <div className="hud-header">Knowledge Map</div>
            <div className="hud-items">
              <div className="hud-item">
                <span className="hud-swatch" style={{ width: 8, height: 8, background: "rgba(255,255,255,0.5)" }} />
                <span className="hud-swatch" style={{ width: 14, height: 14, background: "rgba(255,255,255,0.85)" }} />
                <span className="hud-label">Size = PageRank importance</span>
              </div>
              <div className="hud-item">
                <span className="hud-swatch" style={{ background: "#c9c8c5" }} />
                <span className="hud-swatch" style={{ background: "#3a3a3c" }} />
                <span className="hud-label">Brightness = freshness</span>
              </div>
              <div className="hud-item">
                {tagSwatches.map(([tag, color]) => (
                  <span
                    key={tag}
                    className="hud-swatch"
                    style={{ background: color, width: 10, height: 10, marginLeft: -4 }}
                    title={`#${tag}`}
                  />
                ))}
                <span className="hud-label">Color = primary tag</span>
              </div>
              <div className="hud-item">
                <span className="hud-swatch ring" />
                <span className="hud-label">Selected note</span>
              </div>
            </div>
            <div className="hud-note">
              Drag to pan · scroll to zoom · double-click to recenter · click a node to open
            </div>
          </div>
        )}
      </div>

      {nodes.length === 0 && !failed && (
        <div className="graph-overlay">
          <span>No notes yet — create markdown files in your vault to see the graph.</span>
        </div>
      )}
      {failed && (
        <div className="graph-overlay">
          <span>WebGL context was lost. Switch back to 2D Map to continue.</span>
        </div>
      )}
    </div>
  );
}
