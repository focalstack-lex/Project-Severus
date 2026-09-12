import { useEffect, useRef, useState } from "react";
import ForceGraph3D from "3d-force-graph";
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

  // 3D Graph Initialization
  useEffect(() => {
    if (graphMode !== "3d") return;
    const container = containerRef.current;
    if (!container) return;
    let instance: GraphInstance = null;
    let ro: ResizeObserver | null = null;

    try {
      const fg = new ForceGraph3D(container);
      fg.backgroundColor("#090b0e")
        .showNavInfo(false)
        .nodeRelSize(2.5)
        .nodeLabel((node: unknown) => {
          const n = node as VisNode;
          const tagList = n.tags && n.tags.length > 0 ? `#${n.tags.join(" #")}` : "";
          return `<div class="node-label"><strong>${n.title ?? ""}</strong> <span style="opacity:0.7;">${tagList}</span></div>`;
        })
        .onNodeClick((node: unknown) => {
          const id = (node as VisNode).id;
          if (typeof id === "string") selectRef.current(id);
        })
        .linkVisibility((link: unknown) => linkVisible(link as { source: unknown; target: unknown }))
        .linkOpacity(0.25);

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
        // destructor finished
      }
      fgRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [graphMode]);

  // Update 3D Data
  useEffect(() => {
    if (graphMode !== "3d" || !fgRef.current) return;
    fgRef.current.graphData({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });
  }, [nodes, links, graphMode]);

  // 2D Canvas Graph Mode Implementation
  const canvas2DRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (graphMode !== "2d") return;
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const visibleNodes = nodes.filter((n) => nodeVisible(n.id));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = links.filter((l) => {
      const src = typeof l.source === "string" ? l.source : (l.source as any)?.id;
      const tgt = typeof l.target === "string" ? l.target : (l.target as any)?.id;
      return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
    });

    // Create 2D position state
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    visibleNodes.forEach((n, idx) => {
      const angle = (idx / visibleNodes.length) * 2 * Math.PI;
      const radius = 120 + Math.random() * 80;
      positions.set(n.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // Draw links
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      visibleLinks.forEach((l) => {
        const srcId = typeof l.source === "string" ? l.source : (l.source as any)?.id;
        const tgtId = typeof l.target === "string" ? l.target : (l.target as any)?.id;
        const p1 = positions.get(srcId);
        const p2 = positions.get(tgtId);
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      });

      // Draw nodes
      visibleNodes.forEach((n) => {
        const pos = positions.get(n.id);
        if (!pos) return;

        const isSelected = selectedId && n.id.toLowerCase() === selectedId.toLowerCase();
        const nodeRadius = Math.max(6, Math.min(18, n.size * 1.8));

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? "#3b82f6" : n.color || "#9ca3af";
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw title label
        ctx.font = "12px Inter, sans-serif";
        ctx.fillStyle = isSelected ? "#ffffff" : "#d1d5db";
        ctx.textAlign = "center";
        ctx.fillText(n.title, pos.x, pos.y + nodeRadius + 14);
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = width;
        canvas.height = height;
      }
    };
    window.addEventListener("resize", handleResize);

    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left - width / 2;
      const clickY = e.clientY - rect.top - height / 2;

      for (const n of visibleNodes) {
        const pos = positions.get(n.id);
        if (!pos) continue;
        const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
        if (dist <= 18) {
          onSelectNote(n.id);
          break;
        }
      }
    };
    canvas.addEventListener("click", handleCanvasClick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, [graphMode, nodes, links, activeTags, selectedId, onSelectNote]);

  const handleResetCamera = () => {
    if (graphMode === "3d" && fgRef.current) {
      fgRef.current.zoomToFit(500, 100);
    }
  };

  return (
    <div className="graph-pane-inner">
      {/* Visual Mode Switcher Header */}
      <div className="graph-toolbar">
        <div className="graph-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${graphMode === "2d" ? "active" : ""}`}
            onClick={() => setGraphMode("2d")}
          >
            2D Canvas Map
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
          {nodes.length} Nodes · {links.length} Links
        </span>
      </div>

      {/* Render Canvas depending on mode */}
      {graphMode === "3d" ? (
        <div ref={containerRef} className="graph-container 3d" />
      ) : (
        <canvas ref={canvas2DRef} className="graph-container 2d" />
      )}

      {/* Topology HUD / Legend */}
      <div className={`graph-hud ${hudOpen ? "open" : "collapsed"}`}>
        <div className="graph-hud-bar">
          <button
            type="button"
            className="graph-hud-btn"
            onClick={() => setHudOpen((prev) => !prev)}
            title="Toggle Graph Legend"
          >
            <span className="hud-icon">{hudOpen ? "✕" : "ⓘ"}</span>
            <span>{hudOpen ? "Close Legend" : "Graph Legend"}</span>
          </button>
          {graphMode === "3d" && (
            <button
              type="button"
              className="graph-hud-btn icon-only"
              onClick={handleResetCamera}
              title="Reset Camera"
            >
              <span>⟲</span>
            </button>
          )}
        </div>

        {hudOpen && (
          <div className="graph-hud-card">
            <div className="hud-header">Knowledge Map Legend</div>
            <div className="hud-items">
              <div className="hud-item">
                <span className="hud-dot blue" />
                <span className="hud-label">Vault Note</span>
              </div>
              <div className="hud-item">
                <span className="hud-dot yellow" />
                <span className="hud-label">PageRank Central Hub</span>
              </div>
              <div className="hud-item">
                <span className="hud-dot green" />
                <span className="hud-label">Active Selected Node</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {nodes.length === 0 && !failed && (
        <div className="graph-overlay">
          No notes yet. Create markdown files in your vault to visualize your graph.
        </div>
      )}
      {failed && (
        <div className="graph-overlay">
          WebGL canvas context was lost. Select 2D Canvas Map above to continue.
        </div>
      )}
    </div>
  );
}
