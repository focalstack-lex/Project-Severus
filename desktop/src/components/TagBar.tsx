import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

interface Props {
  tags: string[];
  colors: Record<string, string>;
  active: Set<string>;
  onToggle: (tag: string) => void;
  onReset?: () => void;
}

export default function TagBar({ tags, colors, active, onToggle, onReset }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("mousedown", handleOutsideClick);
    }
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  if (tags.length === 0) return null;

  const totalTags = tags.length;
  const activeCount = tags.filter((t) => active.has(t)).length;
  const hasFiltered = activeCount < totalTags;

  return (
    <div className="tag-bar-floating-wrapper" ref={wrapperRef}>
      {/* Floating Tag Details Popover */}
      {isOpen && (
        <div className="tagbar-popover" role="toolbar" aria-label="Knowledge tag filters">
          <div className="tagbar-popover-header">
            <div className="tagbar-header-left">
              <span className="tagbar-title-icon">
                <Icon name="tag" size={12} />
              </span>
              <span className="tagbar-title">Tag Filters</span>
              <span className="tagbar-badge">
                {activeCount}/{totalTags}
              </span>
            </div>
            <div className="tagbar-header-right">
              {hasFiltered && onReset && (
                <button
                  type="button"
                  className="tag-reset-btn"
                  onClick={onReset}
                  title="Reset all tag filters to visible"
                >
                  <Icon name="reset" size={11} />
                  <span>RESET</span>
                </button>
              )}
              <button
                type="button"
                className="tagbar-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close tag details"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>

          <div className="tagbar-chips-grid">
            {tags.map((tag) => {
              const isActive = active.has(tag);
              const dotColor = colors[tag] ?? "#8f98a3";

              return (
                <button
                  key={tag}
                  type="button"
                  className={`tag-chip ${isActive ? "active" : "off"}`}
                  onClick={() => onToggle(tag)}
                  title={isActive ? `Hide #${tag}` : `Show #${tag}`}
                >
                  <span
                    className="tag-dot"
                    style={{
                      backgroundColor: isActive ? dotColor : "rgba(255, 255, 255, 0.18)",
                      boxShadow: isActive ? `0 0 6px ${dotColor}90` : "none",
                    }}
                  />
                  <span className="tag-text">
                    <span className="tag-hash">#</span>
                    {tag.toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        type="button"
        className={`tag-bar-trigger-btn ${isOpen ? "open" : ""} ${hasFiltered ? "filtered" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? "Hide tag details" : "Click to view and filter tags"}
        aria-expanded={isOpen}
      >
        <span className="tag-trigger-icon">
          <Icon name="tag" size={12} />
        </span>
        <span className="tag-trigger-label">Tags</span>
        <span className="tag-trigger-count">{totalTags}</span>
        {hasFiltered && <span className="tag-trigger-dot" title="Filters active" />}
        <span className="tag-trigger-chevron">
          <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
    </div>
  );
}
