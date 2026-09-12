import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

interface Props {
  content: string;
  onOpenLink?: (name: string) => void;
  onToggleTag?: (tag: string) => void;
  className?: string;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(content: string): string {
  const withLinks = content.replace(/\[\[([^\]]+)\]\]/g, (_match, name: string) => {
    const trimmed = name.trim();
    return `<a class="wikilink" data-note="${escapeHtmlAttr(trimmed)}"><span style="opacity:0.5;font-size:10px;">[[</span>${escapeHtmlAttr(trimmed)}<span style="opacity:0.5;font-size:10px;">]]</span></a>`;
  });
  const withTags = withLinks.replace(
    /(^|\s)#([A-Za-z][A-Za-z0-9_-]*)/g,
    (_match, pre: string, tag: string) =>
      `${pre}<span class="md-tag" data-tag="${tag}">#${tag}</span>`,
  );
  const html = marked.parse(withTags, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html);
}

export default function MarkdownPreview({ content, onOpenLink, onToggleTag, className }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className={className ? `md-preview ${className}` : "md-preview"}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const link = target.closest(".wikilink");
        if (link) {
          onOpenLink?.(link.getAttribute("data-note") ?? "");
          return;
        }
        const tag = target.closest(".md-tag");
        if (tag) onToggleTag?.(tag.getAttribute("data-tag") ?? "");
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
