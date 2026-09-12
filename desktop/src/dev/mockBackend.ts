/*
 * Dev-only mock of the Tauri IPC backend so the renderer can run in a plain
 * browser (`npm run dev`) with the real vault data. Activated from main.tsx
 * only when `import.meta.env.DEV` is true AND no Tauri host is present, so it
 * is dead code in `npm run build` and never runs inside the installed app.
 *
 * The graph math mirrors src-tauri/src/graph.rs (wiki-links weight 1.0,
 * shared-tag edges weight 0.3, PageRank damping 0.85 over 100 iterations)
 * and second-brain/build_graph.py (node size, freshness decay), using a
 * snapshot of the real vault contents.
 */

interface MockNode {
  id: string;
  title: string;
  tags: string[];
  excerpt: string;
  content: string;
}

const NOTES: MockNode[] = [
  {
    id: "The Ascension",
    title: "The Ascension",
    tags: ["ascension", "meta"],
    excerpt:
      "The ongoing upgrade of this environment from a plain coding assistant into an autonomous Senior Engineer: strict rules, forensic skills, self-made tools, and a knowledge graph that fades when neglected.",
    content:
      "# The Ascension\n\nThe ongoing upgrade of this environment from a plain coding assistant into an autonomous Senior Engineer: strict rules, forensic skills, self-made tools, and a knowledge graph that fades when neglected.\n\nKey pillars: [[Zero Hallucination Directive]], [[Continuous Evolution]], [[Agent Skills]], [[Second Brain]].\n\nThis note is the hub of the graph — every other pillar links back here. #ascension #meta\n",
  },
  {
    id: "Zero Hallucination Directive",
    title: "Zero Hallucination Directive",
    tags: ["protocol", "verification"],
    excerpt:
      "Never guess. Explore with real terminal commands, cite `file:line` for claims about code, and run the build or tests before declaring any task done.",
    content:
      "# Zero Hallucination Directive\n\nNever guess. Explore with real terminal commands, cite `file:line` for claims about code, and run the build or tests before declaring any task done.\n\nA task without verification is not finished — it is merely typed. Related: [[The Ascension]]. #protocol #verification\n",
  },
  {
    id: "Continuous Evolution",
    title: "Continuous Evolution",
    tags: ["philosophy", "ascension"],
    excerpt:
      "There is no Apex State. When a limitation or bottleneck appears, propose a concrete evolution — an architecture change, a hook, a skill, a tool — instead of silently working around it.",
    content:
      "# Continuous Evolution\n\nThere is no Apex State. When a limitation or bottleneck appears, propose a concrete evolution — an architecture change, a hook, a skill, a tool — instead of silently working around it. Before entering a brand-new domain, present a short evolution plan first.\n\nPart of [[The Ascension]]. #philosophy #ascension\n",
  },
  {
    id: "Agent Skills",
    title: "Agent Skills",
    tags: ["tools", "skills"],
    excerpt:
      "Capabilities live in folders with a `SKILL.md` (frontmatter: `name`, `description`; body: the playbook). The same open format works in ZCode and Antigravity, so a skill is written once and used in both.",
    content:
      "# Agent Skills\n\nCapabilities live in folders with a `SKILL.md` (frontmatter: `name`, `description`; body: the playbook). The same open format works in ZCode (`~/.agents/skills/`) and Antigravity (`~/.gemini/config/skills/`), so a skill is written once and used in both.\n\nInstalled ascension skills: codebase-auditor, forensic-audit, uiux-auditor, project-scaffolding, deploy-checklist. See [[The Ascension]]. #tools #skills\n",
  },
  {
    id: "Second Brain",
    title: "Second Brain",
    tags: ["meta", "knowledge"],
    excerpt:
      "This graph is the environment's memory: notes carry inline tags and `[[wiki-links]]`, and become a 3D graph where size encodes PageRank importance and brightness encodes freshness — older notes visibly decay.",
    content:
      "# Second Brain\n\nThis graph is the environment's memory: notes carry inline tags and `[[wiki-links]]`, and become a 3D graph where size encodes PageRank importance and brightness encodes freshness — older notes visibly decay. Rebuild after editing notes:\n\n    python second-brain/build_graph.py\n\nBuilt with the Python standard library only. See [[The Ascension]] and [[Agent Skills]]. #meta #knowledge\n",
  },
  {
    id: "impeccable_design_skills",
    title: "Impeccable Design Skills",
    tags: ["skills", "design", "tools", "impeccable", "ui-ux"],
    excerpt:
      "`impeccable` (v4.3.1) is an out-of-distribution frontend design intelligence engine created by Paul Bakaus, installed into Severus and Google Antigravity IDE.",
    content:
      "# Impeccable Design Skills\n\n`impeccable` (v4.3.1) is an out-of-distribution frontend design intelligence engine created by Paul Bakaus ([impeccable repo](https://github.com/pbakaus/impeccable.git)), installed into Severus and Google Antigravity IDE.\n\nIt provides AI agents with senior design director craft: typography hierarchies, spatial rhythm, purposeful animations, accessibility rigor, visual critique, and interactive browser iteration.\n\nRelated: [[Ascension_Guide]], [[SYSTEM]]\n\n#skills #design #tools #impeccable #ui-ux\n",
  },
];

const WIKI_LINKS: Array<[string, string]> = [
  ["Agent Skills", "The Ascension"],
  ["Continuous Evolution", "The Ascension"],
  ["Second Brain", "The Ascension"],
  ["Second Brain", "Agent Skills"],
  ["The Ascension", "Zero Hallucination Directive"],
  ["The Ascension", "Continuous Evolution"],
  ["The Ascension", "Agent Skills"],
  ["The Ascension", "Second Brain"],
  ["Zero Hallucination Directive", "The Ascension"],
];

const SHARED_TAG_PAIRS: Array<[string, string]> = [
  ["Agent Skills", "impeccable_design_skills"],
  ["Continuous Evolution", "The Ascension"],
  ["Second Brain", "The Ascension"],
];

const TAG_ORDER: string[] = [
  "ascension",
  "meta",
  "protocol",
  "verification",
  "philosophy",
  "tools",
  "skills",
  "knowledge",
  "design",
  "impeccable",
  "ui-ux",
];

function computeGraphData() {
  const ids = NOTES.map((n) => n.id);
  const links = [
    ...WIKI_LINKS.map(([source, target]) => ({ source, target, weight: 1.0 })),
    ...SHARED_TAG_PAIRS.map(([source, target]) => ({ source, target, weight: 0.3 })),
  ];

  // PageRank, damping 0.85, 100 iterations, dangling mass redistributed.
  const rank = new Map<string, number>(ids.map((id) => [id, 1 / ids.length]));
  const outgoing = new Map<string, number>();
  for (const link of links) {
    if (link.weight >= 1.0) {
      outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + 1);
    }
  }
  for (let i = 0; i < 100; i += 1) {
    const next = new Map(ids.map((id) => [id, (1 - 0.85) / ids.length]));
    let danglingMass = 0;
    for (const id of ids) {
      const out = outgoing.get(id) ?? 0;
      if (out === 0) {
        danglingMass += rank.get(id) ?? 0;
      }
    }
    for (const link of links) {
      if (link.weight < 1.0) continue;
      next.set(link.target, (next.get(link.target) ?? 0) + (0.85 * (rank.get(link.source) ?? 0)) / (outgoing.get(link.source) ?? 1));
    }
    for (const id of ids) {
      next.set(id, (next.get(id) ?? 0) + (0.85 * danglingMass) / ids.length);
    }
    for (const [id, value] of next) rank.set(id, value);
  }

  const totalRank = ids.reduce((sum, id) => sum + (rank.get(id) ?? 0), 0);
  const maxRank = Math.max(...ids.map((id) => rank.get(id) ?? 0));
  const nodes = NOTES.map((note) => {
    const r = rank.get(note.id) ?? 0;
    const importance = totalRank > 0 ? (r / totalRank) * 100 : 0;
    return {
      id: note.id,
      title: note.title,
      tags: note.tags,
      excerpt: note.excerpt,
      importance,
      size: 2 + 22 * Math.pow(maxRank > 0 ? r / maxRank : 0, 0.7),
      ageDays: 0,
    };
  });

  return { nodes, links, tags: TAG_ORDER };
}

const GRAPH_DATA = computeGraphData();

/** ~120 ms of silence as a WAV data URL so voice calls resolve in the browser. */
function silentWavDataUrl(): string {
  const sampleRate = 8000;
  const samples = 960;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeText(36, "data");
  view.setUint32(40, samples, true);
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const SILENT_AUDIO = silentWavDataUrl();

const HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  get_graph_data: () => GRAPH_DATA,
  list_notes: () =>
    NOTES.map((n) => ({ id: n.id, title: n.title, tags: n.tags })),
  read_note: (args) => {
    const note = NOTES.find((n) => n.id === String(args.id));
    if (!note) throw new Error(`Note not found: ${String(args.id)}`);
    return { id: note.id, title: note.title, content: note.content };
  },
  save_note: (args) => {
    const note = NOTES.find((n) => n.id === String(args.id));
    if (note) note.content = String(args.content);
    return null;
  },
  append_journal: () => new Date().toISOString().slice(11, 19),
  open_in_editor: () => null,
  get_git_status: () => ({
    branch: "main",
    is_clean: true,
    modified_count: 0,
    untracked_count: 0,
    files: [],
  }),
  get_workspace_context: () => ({
    workspace_name: "Severus",
    workspace_path: "C:\\Users\\User\\Documents\\Severus",
    git_branch: "main",
    ide_environments: ["zcode", "gemini"],
    today_journal: null,
    vault_notes: NOTES.map((n) => n.title),
  }),
  get_voice_audio: () => SILENT_AUDIO,
  restore_window: () => null,
  "plugin:event|listen": () => 1,
  "plugin:event|unlisten": () => null,
  "plugin:dialog|confirm": () => true,
  "plugin:dialog|open": () => null,
  "plugin:dialog|message": () => null,
  "plugin:dialog|ask": () => true,
};

export function installMockBackend(): void {
  if ("__TAURI_INTERNALS__" in window) return;
  console.info(
    "[severus] Running with the dev mock backend (no Tauri host detected).",
  );

  let callbackId = 0;
  const internals = {
    transformCallback(callback: (response: unknown) => void, once?: boolean): number {
      callbackId += 1;
      const id = callbackId;
      const key = `_${id}`;
      Object.defineProperty(window, key, {
        value: (response?: unknown) => {
          if (once) delete (window as unknown as Record<string, unknown>)[key];
          callback(response);
        },
        writable: false,
        configurable: true,
      });
      return id;
    },
    invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
      const handler = HANDLERS[cmd];
      if (!handler) {
        return Promise.reject(new Error(`[severus dev mock] Unhandled IPC command: ${cmd}`));
      }
      return Promise.resolve().then(() => handler(args));
    },
    isTauri: true,
  };
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: internals,
    writable: false,
    configurable: false,
  });
}
