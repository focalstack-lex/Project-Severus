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
  const [failed, setFailed] = useState(false);

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

  // init once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: GraphInstance = null;
    let ro: ResizeObserver | null = null;

    try {
      const fg = new ForceGraph3D(container);
      fg.backgroundColor("#040404")
        .showNavInfo(false)
        .nodeRelSize(2)
        .nodeLabel((node: unknown) => {
          const n = node as VisNode;
          const tagList = n.tags && n.tags.length > 0 ? `#${n.tags.join(" #")}` : "no tags";
          return `<div class="node-label"><strong>${n.title ?? ""}</strong><span style="color:#888888;font-size:10px;margin-left:4px;">${n.importance}% · ${tagList}</span></div>`;
        })
        .onNodeClick((node: unknown) => {
          const id = (node as VisNode).id;
          if (typeof id === "string") selectRef.current(id);
        })
        .linkOpacity(0.35);

      const charge = (fg as unknown as { d3Force?: (key: string) => unknown }).d3Force?.(
        "charge",
      ) as { strength?: (value: number) => unknown } | undefined;
      charge?.strength?.(-400);

      fg.onEngineStop(() => fg.zoomToFit(600, 120));
      instance = fg;
      fgRef.current = fg;

      // Handle dynamic sidebar opening/closing and window resize seamlessly
      ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          fg.width(container.clientWidth);
          fg.height(container.clientHeight);
        }
      });
      ro.observe(container);

      const canvas = container.querySelector("canvas");
      const onLost = (event: Event) => {
        event.preventDefault();
        setFailed(true);
      };
      canvas?.addEventListener("webglcontextlost", onLost);
    } catch {
      setFailed(true);
    }

    return () => {
      ro?.disconnect();
      try {
        instance?._destructor?.();
      } catch {
        // engine already gone
      }
      fgRef.current = null;
      container.innerHTML = "";
    };
  }, []);

  // push new data into the engine
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.graphData({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });
  }, [nodes, links]);

  // re-assign accessors so the engine re-evaluates visibility/fade/selection
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.nodeColor((node: VisNode) => {
      if (!nodeVisible(node.id)) return "rgba(0,0,0,0)";
      if (selectedRef.current && node.id.toLowerCase() === selectedRef.current.toLowerCase()) {
        return "#ffffff"; // highlight active note in bright white
      }
      return node.color;
    });

    fg.nodeVal((node: VisNode) => {
      if (!nodeVisible(node.id)) return 0.001;
      const isSel = selectedRef.current && node.id.toLowerCase() === selectedRef.current.toLowerCase();
      return isSel ? node.size * 1.35 : node.size;
    });

    fg.linkColor((link: { source: unknown; target: unknown }) =>
      linkVisible(link) ? "rgba(255, 255, 255, 0.12)" : "rgba(0,0,0,0)",
    );

    fg.linkWidth((link: { source: unknown; target: unknown; weight?: number }) =>
      linkVisible(link) ? 0.3 + (link.weight ?? 0.3) : 0,
    );
  });

  return (
    <div className="graph-pane-inner">
      <div ref={containerRef} className="graph-container" />
      {nodes.length === 0 && !failed && (
        <div className="graph-overlay">
          No notes yet.
          <br />
          Add markdown files to <code>second-brain/notes/</code> — or create one from a
          wiki-link.
        </div>
      )}
      {failed && (
        <div className="graph-overlay">
          WebGL is unavailable or the context was lost.
          <br />
          Restart the app to retry.
        </div>
      )}
    </div>
  );
}
