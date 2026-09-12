import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import GraphView, { type VisNode } from "./components/GraphView";
import TagBar from "./components/TagBar";
import NoteEditor from "./components/NoteEditor";
import JournalCapture from "./components/JournalCapture";
import {
  appendJournal,
  getGraphData,
  listNotes,
  onNotesChanged,
  readNote,
  saveNote,
} from "./lib/tauri";
import { fade, freshnessOpacity, tagColors } from "./lib/colors";
import type { GraphData, NoteContent, NoteMeta } from "./types";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [], tags: [] };

export default function App() {
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [notesList, setNotesList] = useState<NoteMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [journalOpen, setJournalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(
      () => setToast((current) => (current === message ? null : current)),
      2600,
    );
  }, []);

  const loadGraph = useCallback(async () => {
    try {
      const data = await getGraphData();
      setGraph(data);
      setActiveTags((current) => {
        const next = new Set(current);
        for (const tag of data.tags) next.add(tag);
        return next;
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  const loadNotesList = useCallback(async () => {
    try {
      setNotesList(await listNotes());
    } catch {
      // keep the previous list; the next watcher tick will retry
    }
  }, []);

  const refreshSelected = useCallback(async (id: string | null) => {
    if (!id) {
      setNote(null);
      return;
    }
    try {
      setNote(await readNote(id));
    } catch {
      setNote(null);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
    void loadNotesList();
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void onNotesChanged(() => {
      void loadGraph();
      void loadNotesList();
      setRefreshTick((tick) => tick + 1);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadGraph, loadNotesList]);

  const openNote = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setEditorOpen(true);
      await refreshSelected(id);
    },
    [refreshSelected],
  );

  // reload the selected note whenever the watcher signals a change
  useEffect(() => {
    if (refreshTick > 0) void refreshSelected(selectedId);
  }, [refreshTick, selectedId, refreshSelected]);

  const handleSave = useCallback(
    async (id: string, content: string) => {
      await saveNote(id, content);
      showToast(`Saved "${id}"`);
      // the watcher emits notes-changed; graph and note refresh automatically
    },
    [showToast],
  );

  const handleOpenLink = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = notesList.find((n) => n.id.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        await openNote(existing.id);
        return;
      }
      const ok = await confirm(`Note "${trimmed}" does not exist yet. Create it?`, {
        title: "Second Brain",
        kind: "info",
      });
      if (!ok) return;
      try {
        await saveNote(trimmed, `# ${trimmed}\n\n`);
        await loadNotesList();
        await loadGraph();
        await openNote(trimmed);
        showToast(`Created "${trimmed}"`);
      } catch (err) {
        showToast(`Could not create note: ${String(err)}`);
      }
    },
    [notesList, openNote, loadNotesList, loadGraph, showToast],
  );

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleJournal = useCallback(
    async (text: string) => {
      const stamp = await appendJournal(text);
      showToast(`Journaled at ${stamp}`);
    },
    [showToast],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setJournalOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const colors = useMemo(() => tagColors(graph.tags), [graph.tags]);
  const visNodes = useMemo<VisNode[]>(
    () =>
      graph.nodes.map((node) => {
        const base = node.tags.length > 0 ? (colors[node.tags[0]] ?? "#9aa4b2") : "#9aa4b2";
        return { ...node, color: fade(base, freshnessOpacity(node.ageDays)) };
      }),
    [graph, colors],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand">
            LEX MATONDO <span className="dim">// SEVERUS</span>
          </div>
          <div className="badge-pill live">
            <span className="live-dot" />
            <span>KNOWLEDGE ENGINE</span>
          </div>
        </div>

        <div className="topbar-center">
          <div className="metrics-pill">
            <strong>{graph.nodes.length}</strong> NODES · <strong>{graph.links.length}</strong> CONNECTIONS
          </div>
        </div>

        <div className="topbar-actions">
          <button onClick={() => setJournalOpen(true)} title="Quick capture (Ctrl+J)">
            + JOURNAL [CTRL+J]
          </button>
          <button
            onClick={() => setEditorOpen((open) => !open)}
            title="Show or hide the workspace note panel"
          >
            {editorOpen ? "HIDE WORKSPACE" : "VIEW WORKSPACE"}
          </button>
        </div>
      </header>

      <main className="main">
        <div className="graph-pane">
          <GraphView
            nodes={visNodes}
            links={graph.links}
            activeTags={activeTags}
            onSelectNote={(id) => void openNote(id)}
          />
          <TagBar
            tags={graph.tags}
            colors={colors}
            active={activeTags}
            onToggle={toggleTag}
          />
        </div>
        {editorOpen && (
          <NoteEditor
            note={note}
            onSave={handleSave}
            onOpenLink={(name) => void handleOpenLink(name)}
            onToggleTag={toggleTag}
            onClose={() => setEditorOpen(false)}
          />
        )}
      </main>

      <footer className="status-bar">
        <div className="status-bar-left">
          <div className="status-item">
            <span>MODE:</span> <span className="highlight">DESKTOP NATIVE (TAURI V2)</span>
          </div>
          <div className="status-item">
            <span>ACTIVE NOTE:</span>{" "}
            <span className="highlight">{selectedId ? `${selectedId}.md` : "NONE (CLICK GRAPH NODE)"}</span>
          </div>
        </div>
        <div className="status-bar-right">
          <div className="status-item">
            <span>FILTER:</span>{" "}
            <span className="highlight">
              {activeTags.size === graph.tags.length ? "ALL TAGS ACTIVE" : `${activeTags.size}/${graph.tags.length} TAGS`}
            </span>
          </div>
          <div className="status-item">
            <span>ENGINEERING &amp; SYSTEMS</span>
          </div>
        </div>
      </footer>

      <JournalCapture
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        onSubmit={handleJournal}
      />

      {loadError && <div className="toast error">Backend error: {loadError}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
