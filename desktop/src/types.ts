export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  excerpt: string;
  importance: number;
  size: number;
  ageDays: number;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  tags: string[];
}

export interface NoteMeta {
  id: string;
  title: string;
  tags: string[];
}

export interface NoteContent {
  id: string;
  title: string;
  content: string;
}
