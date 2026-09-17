export function isHubNode(node?: { id?: string; title?: string } | null): boolean {
  if (!node) return false;
  const idLower = (node.id || "").trim().toLowerCase();
  const titleLower = (node.title || "").trim().toLowerCase();
  return idLower === "the glorious evolution" || titleLower === "the glorious evolution";
}
