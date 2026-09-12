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

  // 2D Canvas Graph Mode Implementation with Pan/Zoom & ResizeObserver
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

    // Create 2D position state spread naturally around center
    const positions = new Map<string, { x: number; y: number }>();
    visibleNodes.forEach((n, idx) => {
      const angle = (idx / Math.max(1, visibleNodes.length)) * 2 * Math.PI;
      const radius = 160 + (idx % 2 === 0 ? 40 : -30);
      positions.set(n.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });

    let cssWidth = canvas.clientWidth || 800;
    let cssHeight = canvas.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;

    const updateDimensions = () => {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        cssWidth = canvas.clientWidth;
        cssHeight = canvas.clientHeight;
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
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

      // Center + pan + zoom
      ctx.translate(cssWidth / 2 + panX, cssHeight / 2 + panY);
      ctx.scale(zoom, zoom);

      // Draw links
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.2;
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
        const nodeRadius = Math.max(8, Math.min(22, n.size * 2));

        // Node glow if selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, nodeRadius + 6, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? "#ffffff" : n.color || "#9ca3af";
        ctx.fill();

        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Title label
        ctx.font = "500 12px Inter, -apple-system, sans-serif";
        ctx.fillStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.85)";
        ctx.textAlign = "center";
        ctx.fillText(n.title, pos.x, pos.y + nodeRadius + 14);
      });

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
          const pos = positions.get(n.id);
          return pos && Math.hypot(mouse.x - pos.x, mouse.y - pos.y) <= 22;
        });
        canvas.style.cursor = hit ? "pointer" : "grab";
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!didDrag) {
        const mouse = getCanvasMousePos(e);
        for (const n of visibleNodes) {
          const pos = positions.get(n.id);
          if (!pos) continue;
          if (Math.hypot(mouse.x - pos.x, mouse.y - pos.y) <= 22) {
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

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
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
