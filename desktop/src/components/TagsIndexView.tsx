import Icon from "./Icon";
import type { GraphData, GraphNode } from "../types";

interface Props {
  graph: GraphData;
  tagColors: Record<string, string>;
  onSelectNote: (id: string) => void;
  onToggleTag: (tag: string) => void;
}

/**
 * Tags & Index — a real center view: every tag with its note count, and the
 * full note index ranked by PageRank importance.
 */
export default function TagsIndexView({ graph, tagColors, onSelectNote, onToggleTag }: Props) {
  const noteCount = (tag: string) =>
    graph.nodes.filter((n) => n.tags.includes(tag)).length;

  const sortedNodes = [...graph.nodes].sort((a, b) => b.importance - a.importance);

  return (
    <div className="tags-index">
      <div className="tags-index-inner">
        <div className="tags-index-head">
          <h2 className="tags-index-title">Tags &amp; Index</h2>
          <span className="tags-index-sub">
            {graph.nodes.length} notes · {graph.tags.length} tags · {graph.links.length} links
          </span>
        </div>

        {graph.tags.length > 0 && (
          <section>
            <div className="home-section-title">Tags</div>
            <div className="tag-cloud">
              {graph.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-pill"
                  onClick={() => onToggleTag(tag)}
                  title={`Filter the graph by #${tag}`}
                >
                  <span
                    className="tag-dot"
                    style={{ backgroundColor: tagColors[tag] ?? "#8f98a3" }}
                  />
                  <span>#{tag}</span>
                  <span className="tag-pill-count">{noteCount(tag)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="home-section-title">All notes, by importance</div>
          <table className="index-table">
            <thead>
              <tr>
                <th>Note</th>
                <th>Tags</th>
                <th>Importance</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map((node: GraphNode) => (
                <tr key={node.id} onClick={() => onSelectNote(node.id)}>
                  <td className="index-cell-title">{node.title}</td>
                  <td>
                    {node.tags.map((tag) => (
                      <span
                        key={tag}
                        className="index-tag-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTag(tag);
                        }}
                      >
                        <span
                          className="tag-dot"
                          style={{ backgroundColor: tagColors[tag] ?? "#8f98a3" }}
                        />
                        #{tag}
                      </span>
                    ))}
                  </td>
                  <td className="index-cell-num">{node.importance.toFixed(1)}%</td>
                  <td className="index-cell-num">
                    {node.ageDays === 0 ? "today" : `${node.ageDays}d ago`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {graph.nodes.length === 0 && (
          <div className="graph-overlay" style={{ position: "static" }}>
            <span>
              No indexed notes yet. <Icon name="file" size={12} /> Create your first note to
              build the index.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
