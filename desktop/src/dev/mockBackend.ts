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
    id: "The Glorious Evolution",
    title: "The Glorious Evolution",
    tags: ["glorious-evolution", "meta"],
    excerpt:
      "The ongoing upgrade of this environment from a plain coding assistant into an autonomous Senior Engineer: strict rules, forensic skills, self-made tools, and a knowledge graph that fades when neglected.",
    content:
      "# The Glorious Evolution\n\nThe ongoing upgrade of this environment from a plain coding assistant into an autonomous Senior Engineer: strict rules, forensic skills, self-made tools, and a knowledge graph that fades when neglected.\n\nKey pillars: [[Zero Hallucination Directive]], [[Continuous Evolution]], [[Agent Skills]], [[Second Brain]].\n\nThis note is the hub of the graph — every other pillar links back here. #glorious-evolution #meta\n",
  },
  {
    id: "Zero Hallucination Directive",
    title: "Zero Hallucination Directive",
    tags: ["protocol", "verification"],
    excerpt:
      "Never guess. Explore with real terminal commands, cite `file:line` for claims about code, and run the build or tests before declaring any task done.",
    content:
      "# Zero Hallucination Directive\n\nNever guess. Explore with real terminal commands, cite `file:line` for claims about code, and run the build or tests before declaring any task done.\n\nA task without verification is not finished — it is merely typed. Related: [[The Glorious Evolution]]. #protocol #verification\n",
  },
  {
    id: "Continuous Evolution",
    title: "Continuous Evolution",
    tags: ["philosophy", "glorious-evolution"],
    excerpt:
      "There is no Apex State. When a limitation or bottleneck appears, propose a concrete evolution — an architecture change, a hook, a skill, a tool — instead of silently working around it.",
    content:
      "# Continuous Evolution\n\nThere is no Apex State. When a limitation or bottleneck appears, propose a concrete evolution — an architecture change, a hook, a skill, a tool — instead of silently working around it. Before entering a brand-new domain, present a short evolution plan first.\n\nPart of [[The Glorious Evolution]]. #philosophy #glorious-evolution\n",
  },
  {
    id: "Agent Skills",
    title: "Agent Skills",
    tags: ["tools", "skills"],
    excerpt:
      "Capabilities live in folders with a `SKILL.md` (frontmatter: `name`, `description`; body: the playbook). The same open format works in ZCode and Antigravity, so a skill is written once and used in both.",
    content:
      "# Agent Skills\n\nCapabilities live in folders with a `SKILL.md` (frontmatter: `name`, `description`; body: the playbook). The same open format works in ZCode (`~/.agents/skills/`) and Antigravity (`~/.gemini/config/skills/`), so a skill is written once and used in both.\n\nInstalled Glorious Evolution skills: codebase-auditor, forensic-audit, uiux-auditor, project-scaffolding, deploy-checklist. See [[The Glorious Evolution]]. #tools #skills\n",
  },
  {
    id: "Second Brain",
    title: "Second Brain",
    tags: ["meta", "knowledge"],
    excerpt:
      "This graph is the environment's memory: notes carry inline tags and `[[wiki-links]]`, and become a 3D graph where size encodes PageRank importance and brightness encodes freshness — older notes visibly decay.",
    content:
      "# Second Brain\n\nThis graph is the environment's memory: notes carry inline tags and `[[wiki-links]]`, and become a 3D graph where size encodes PageRank importance and brightness encodes freshness — older notes visibly decay. Rebuild after editing notes:\n\n    python second-brain/build_graph.py\n\nBuilt with the Python standard library only. See [[The Glorious Evolution]] and [[Agent Skills]]. #meta #knowledge\n",
  },
  {
    id: "impeccable_design_skills",
    title: "Impeccable Design Skills",
    tags: ["skills", "design", "tools", "impeccable", "ui-ux"],
    excerpt:
      "`impeccable` (v4.3.1) is an out-of-distribution frontend design intelligence engine created by Paul Bakaus, installed into Severus and Google Antigravity IDE.",
    content:
      "# Impeccable Design Skills\n\n`impeccable` (v4.3.1) is an out-of-distribution frontend design intelligence engine created by Paul Bakaus ([impeccable repo](https://github.com/pbakaus/impeccable.git)), installed into Severus and Google Antigravity IDE.\n\nIt provides AI agents with senior design director craft: typography hierarchies, spatial rhythm, purposeful animations, accessibility rigor, visual critique, and interactive browser iteration.\n\nRelated: [[Glorious_Evolution_Guide]], [[SYSTEM]]\n\n#skills #design #tools #impeccable #ui-ux\n",
  },
];

const WIKI_LINKS: Array<[string, string]> = [
  ["Agent Skills", "The Glorious Evolution"],
  ["Continuous Evolution", "The Glorious Evolution"],
  ["Second Brain", "The Glorious Evolution"],
  ["Second Brain", "Agent Skills"],
  ["The Glorious Evolution", "Zero Hallucination Directive"],
  ["The Glorious Evolution", "Continuous Evolution"],
  ["The Glorious Evolution", "Agent Skills"],
  ["The Glorious Evolution", "Second Brain"],
  ["Zero Hallucination Directive", "The Glorious Evolution"],
];

const SHARED_TAG_PAIRS: Array<[string, string]> = [
  ["Agent Skills", "impeccable_design_skills"],
  ["Continuous Evolution", "The Glorious Evolution"],
  ["Second Brain", "The Glorious Evolution"],
];

const TAG_ORDER: string[] = [
  "glorious-evolution",
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

const credentials: Record<string, string> = {};

/**
 * Small mirror of the Rust grammar — harness-only, so the Command Console and
 * password flow are demonstrable in a plain browser. The real grammar lives in
 * src-tauri/src/system_control.rs.
 */
function mockResolveCommand(textRaw: string) {
  const text = textRaw.toLowerCase().trim();
  const wrap = (action: string, arg: unknown, description: string) => ({
    intent: { action, arg },
    requires_password: action === "lock_workstation" || action === "close_window",
    description,
  });

  let match = /^(open|launch|start|run)\s+(up\s+)?(.+)$/.exec(text);
  if (match) {
    const rest = match[3].replace(/"/g, "");
    if (rest.startsWith("c:\\") || rest.startsWith("%")) {
      return wrap("open_path", rest, `Open ${rest}`);
    }
    const folders: Record<string, string> = {
      documents: "shell:Personal",
      downloads: "shell:Downloads",
      desktop: "shell:Desktop",
      pictures: "shell:My Pictures",
      severus: "@workspace",
      "second brain": "@notes",
    };
    if (folders[rest]) {
      return wrap("open_known_folder", folders[rest], `Open ${rest}`);
    }
    return wrap("launch_app", rest, `Launch ${rest}`);
  }
  match = /^snap\s+(.*)$/.exec(text);
  if (match) {
    const rest = match[1];
    const position = rest.includes("left")
      ? "left"
      : rest.includes("right")
        ? "right"
        : rest.includes("maximize")
          ? "maximize"
          : "minimize";
    const target = rest
      .replace(/left|right|maximize|minimize|half|side|screen|window|to|the/g, " ")
      .split(" ")
      .filter(Boolean)
      .join(" ");
    return wrap("snap_window", { target: target || null, position }, `Snap to the ${position} half`);
  }
  match = /^volume to (\d+)/.exec(text) ?? /^volume (\d+)/.exec(text);
  if (match) return wrap("volume_set", Math.min(100, Number(match[1])), `Set volume to ${match[1]}%`);
  if (text.includes("volume up") || text.includes("louder")) return wrap("volume_step", 10, "Volume up 10%");
  if (text.includes("volume down") || text.includes("quieter")) return wrap("volume_step", -10, "Volume down 10%");
  if (text.includes("mute")) return wrap("mute_toggle", null, "Toggle mute");
  if (/next (track|song)/.test(text)) return wrap("media_key", "next", "Next track");
  if (/previous (track|song)/.test(text)) return wrap("media_key", "prev", "Previous track");
  if (/^(play|pause|resume)\b/.test(text)) return wrap("media_key", "play_pause", "Play / pause");
  if (text.includes("screenshot")) return wrap("screenshot", null, "Capture a full-screen screenshot");
  if (/next desktop/.test(text)) return wrap("switch_desktop", "next", "Next desktop");
  if (/previous desktop/.test(text)) return wrap("switch_desktop", "prev", "Previous desktop");
  if (text.includes("minimize all") || text.includes("show desktop"))
    return wrap("minimize_all", null, "Minimize every window");
  match = /^(close|quit|kill)\s+(the\s+)?(.+)$/.exec(text);
  if (match) return wrap("close_window", match[3], `Close the ${match[3]} window`);
  if (text.includes("lock")) return wrap("lock_workstation", null, "Lock the workstation");
  match = /^(switch to|focus)\s+(the\s+)?(.+)$/.exec(text);
  if (match) return wrap("focus_app", match[3], `Bring ${match[3]} to the foreground`);
  if (/list windows|show windows|what windows/.test(text)) return wrap("list_windows", null, "List open windows");
  match = /^clipboard\s+(.+)$/.exec(text);
  if (match) return wrap("clipboard_write", match[1], "Copy text to the clipboard");
  if (/^clipboard$/.test(text) || text.includes("read clipboard"))
    return wrap("clipboard_read", null, "Read the clipboard");
  throw new Error("no matching system command");
}

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
  hide_to_tray: () => null,
  set_floating_mode: () => null,
  move_to_monitor: () => "Moved Severus to Display 1 (mock)",
  secure_store: (args) => {
    credentials[String(args.key)] = String(args.value);
    return null;
  },
  secure_load: (args) => {
    const value = credentials[String(args.key)];
    if (value === undefined) throw new Error(`credential '${String(args.key)}' not found`);
    return value;
  },
  secure_delete: (args) => {
    delete credentials[String(args.key)];
    return null;
  },
  gmail_begin_auth: () => {
    // Browser harness cannot do real OAuth — return a fake consent URL and
    // emit the code immediately so the connect flow can be demoed.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("severus-mock-gmail-code", { detail: "mock-auth-code" }));
    }, 300);
    return "https://accounts.google.com/o/oauth2/v2/auth?client_id=mock (harness)";
  },
  system_list_windows: () => [
    { hwnd: 101, title: "system_control.rs — severus-desktop", exe: "Code.exe" },
    { hwnd: 102, title: "New Tab — Google Chrome", exe: "chrome.exe" },
    { hwnd: 103, title: "Downloads", exe: "explorer.exe" },
    { hwnd: 104, title: "Spotify", exe: "spotify.exe" },
  ],
  system_resolve_command: (args) => mockResolveCommand(String(args.text ?? "")),
  system_execute: (args) => {
    const intent = args.intent as { action: string; arg?: unknown };
    const destructive = intent.action === "lock_workstation" || intent.action === "close_window";
    if (destructive && !args.confirmed) {
      throw new Error("password confirmation required");
    }
    const target = typeof intent.arg === "string" ? intent.arg : "";
    const messages: Record<string, string> = {
      launch_app: `Launched ${target} (mock)`,
      open_known_folder: `Opened ${target} (mock)`,
      open_path: `Opened ${target} (mock)`,
      volume_set: `Volume set to ${intent.arg}% (mock)`,
      volume_step: `Volume adjusted (mock)`,
      mute_toggle: "Mute toggled (mock)",
      media_key: `Media ${target} (mock)`,
      clipboard_write: "Copied to clipboard (mock)",
      clipboard_read: "Clipboard: (mock contents)",
      screenshot: "Screenshot saved to Pictures\\Severus (mock)",
      focus_app: `Focused ${target} (mock)`,
      list_windows: "Code.exe — system_control.rs\nchrome.exe — New Tab (mock)",
      snap_window: `Snapped window (mock)`,
      minimize_all: "Minimized every window (mock)",
      switch_desktop: `Switched desktop ${target} (mock)`,
      lock_workstation: "Workstation locked (mock)",
      close_window: `Asked ${target} to close (mock)`,
    };
    return messages[intent.action] ?? "Done (mock)";
  },
};

export function installMockBackend(): void {
  if ("__TAURI_INTERNALS__" in window) return;
  console.info(
    "[severus] Running with the dev mock backend (no Tauri host detected).",
  );

  let callbackId = 0;
  const internals = {
    // getCurrentWindow()/getCurrentWebview() read these synchronously on
    // mount — without them the renderer crashes and React unmounts.
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
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
      // Tauri event + window plugin IPC — resolve with a no-op so listeners
      // and window show/hide calls register cleanly in the harness.
      if (cmd.startsWith("plugin:event|") || cmd.startsWith("plugin:window|")) {
        return Promise.resolve(() => {});
      }
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
