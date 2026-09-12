interface Props {
  tags: string[];
  colors: Record<string, string>;
  active: Set<string>;
  onToggle: (tag: string) => void;
}

export default function TagBar({ tags, colors, active, onToggle }: Props) {
  if (tags.length === 0) return null;
  return (
    <div className="tagbar">
      {tags.map((tag) => (
        <button
          key={tag}
          className={`tag-chip${active.has(tag) ? "" : " off"}`}
          style={{ borderColor: active.has(tag) ? colors[tag] ?? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)" }}
          onClick={() => onToggle(tag)}
          title={active.has(tag) ? `Active filter: #${tag}` : `Inactive filter: #${tag}`}
        >
          #{tag.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
