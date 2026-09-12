interface Props {
  tags: string[];
  colors: Record<string, string>;
  active: Set<string>;
  onToggle: (tag: string) => void;
  onReset?: () => void;
}

export default function TagBar({ tags, colors, active, onToggle, onReset }: Props) {
  if (tags.length === 0) return null;

  const hasFiltered = tags.some((t) => !active.has(t));

  return (
    <div className="tagbar" role="toolbar" aria-label="Knowledge Tag Filters">
      {hasFiltered && onReset && (
        <button
          type="button"
          className="tag-chip tag-reset-chip"
          onClick={onReset}
          title="Reset all tag filters to visible"
        >
          <span className="tag-reset-icon">↺</span>
          <span>ALL</span>
        </button>
      )}

      {tags.map((tag) => {
        const isActive = active.has(tag);
        const dotColor = colors[tag] ?? "#9aa4b2";

        return (
          <button
            key={tag}
            type="button"
            className={`tag-chip ${isActive ? "active" : "off"}`}
            onClick={() => onToggle(tag)}
            title={
              isActive
                ? `Click to filter out #${tag}`
                : `Click to show #${tag}`
            }
          >
            <span
              className="tag-dot"
              style={{
                backgroundColor: isActive ? dotColor : "rgba(255, 255, 255, 0.2)",
              }}
            />
            <span className="tag-text">#{tag.toLowerCase()}</span>
          </button>
        );
      })}
    </div>
  );
}
