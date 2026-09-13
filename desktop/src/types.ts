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

export interface GitFileEntry {
  status: string;
  path: string;
}

export interface GitStatusData {
  branch: string;
  is_clean: boolean;
  modified_count: number;
  untracked_count: number;
  files: GitFileEntry[];
}

export interface WorkspaceContext {
  workspace_name: string;
  workspace_path: string;
  git_branch: string;
  ide_environments: string[];
  today_journal: string | null;
  vault_notes: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

export interface MemoryItem {
  id: string;
  category: string;
  content: string;
  status: "current" | "historical" | "preference" | "hard_constraint" | "project" | "goal" | "routine" | "uncertain" | "deprecated" | string;
  confidence: "high" | "medium" | "low" | string;
  created_at: string;
  updated_at: string;
  source: string;
  related_project?: string | null;
  importance: "high" | "medium" | "low" | string;
}

export interface MemoryFilter {
  category?: string;
  status?: string;
  importance?: string;
  search?: string;
}

