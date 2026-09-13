import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon";
import {
  loadCachedStravaStats,
  fetchStravaAthleteStats,
  type StravaAthleteStats,
} from "../lib/strava";
import {
  loadTrainingBlocks,
  addTrainingBlock,
  setActiveTrainingBlock,
  toggleWorkoutCompleted,
  deleteTrainingBlock,
  loadRunningGoals,
  addRunningGoal,
  toggleGoalCompleted,
  deleteRunningGoal,
  generateSuggestBetterInsights,
  type TrainingBlock,
  type RunningGoal,
  type SuggestionInsight,
  type WorkoutIntensity,
} from "../lib/trainingBlocks";
import { appendJournal, readTodayJournal } from "../lib/tauri";
import { speakText } from "../lib/voice";
import { sendAIChat, type AIConfig } from "../lib/ai";

interface RunningModeWindowProps {
  open: boolean;
  onClose: () => void;
  onMinimizeToFloating?: () => void;
  aiConfig: AIConfig;
  onShowToast?: (msg: string) => void;
}

type TabType = "dashboard" | "blocks" | "goals" | "suggest";

export default function RunningModeWindow({
  open,
  onClose,
  onMinimizeToFloating,
  aiConfig,
  onShowToast,
}: RunningModeWindowProps) {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // Telemetry & Stats State
  const [stravaStats, setStravaStats] = useState<StravaAthleteStats | null>(loadCachedStravaStats);
  const [isSyncing, setIsSyncing] = useState(false);
  const [todayJournalRaw, setTodayJournalRaw] = useState("");
  const [runLogged, setRunLogged] = useState(false);

  // Training Blocks State
  const [blocks, setBlocks] = useState<TrainingBlock[]>(loadTrainingBlocks);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockWeeklyKm, setBlockWeeklyKm] = useState(45);
  const [blockWeeks, setBlockWeeks] = useState(4);
  const [blockFocus, setBlockFocus] = useState("");

  // Running Goals State
  const [goals, setGoals] = useState<RunningGoal[]>(loadRunningGoals);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalCategory, setGoalCategory] = useState<"mileage" | "pace" | "race" | "habit">("mileage");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");

  // Suggest Better State
  const [insights, setInsights] = useState<SuggestionInsight[]>([]);
  const [aiConsultQuery, setAiConsultQuery] = useState("");
  const [aiConsultResponse, setAiConsultResponse] = useState<string | null>(null);
  const [isAiConsulting, setIsAiConsulting] = useState(false);

  // Refresh Journal
  const refreshJournal = useCallback(async () => {
    try {
      const content = await readTodayJournal();
      setTodayJournalRaw(content || "");
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refreshJournal();
      const currentStats = loadCachedStravaStats();
      setStravaStats(currentStats);
      const curBlocks = loadTrainingBlocks();
      setBlocks(curBlocks);
      const curGoals = loadRunningGoals();
      setGoals(curGoals);

      const activeB = curBlocks.find((b) => b.status === "active") || curBlocks[0];
      setInsights(generateSuggestBetterInsights(currentStats, activeB, curGoals));
    }
  }, [open, refreshJournal]);

  // Check if run already in today's journal
  useEffect(() => {
    if (stravaStats?.latestRun && todayJournalRaw) {
      const runId = String(stravaStats.latestRun.id);
      const runName = stravaStats.latestRun.name;
      setRunLogged(todayJournalRaw.includes(runName) || todayJournalRaw.includes(runId));
    } else {
      setRunLogged(false);
    }
  }, [stravaStats, todayJournalRaw]);

  // Sync Strava
  const handleSyncStrava = async () => {
    setIsSyncing(true);
    try {
      const stats = await fetchStravaAthleteStats();
      setStravaStats(stats);
      const activeB = blocks.find((b) => b.status === "active") || blocks[0];
      setInsights(generateSuggestBetterInsights(stats, activeB, goals));
      onShowToast?.("Strava athletic telemetry synced.");
    } catch (err) {
      console.warn("Strava sync failed:", err);
      onShowToast?.("Strava sync failed. Check API connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  // 1-Click Log Latest Run to Journal
  const handleLogLatestRun = async () => {
    if (!stravaStats?.latestRun || runLogged) return;
    const r = stravaStats.latestRun;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const hrText = r.averageHeartrate ? ` · ${r.averageHeartrate} bpm (Zone 2)` : "";
    const elevText = r.elevationGainM > 0 ? ` · +${r.elevationGainM}m elevation` : "";
    const entry = `[${timeStr}] 🏃 Strava Run: ${r.name} (${r.formattedDistance} in ${r.formattedDuration} @ ${r.formattedPace}${hrText}${elevText})`;

    try {
      await appendJournal(entry);
      setRunLogged(true);
      void refreshJournal();
      onShowToast?.("Appended run to today's action log.");
    } catch (err) {
      console.error("Failed to append run to journal:", err);
    }
  };

  // Training Block Actions
  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockTitle.trim()) return;
    const updated = addTrainingBlock(blockTitle, blockWeeklyKm, blockWeeks, blockFocus);
    setBlocks(updated);
    setBlockTitle("");
    setBlockFocus("");
    setCreatingBlock(false);
    onShowToast?.(`Created training block: ${blockTitle}`);
  };

  const handleToggleWorkout = (blockId: string, workoutId: string) => {
    const updated = toggleWorkoutCompleted(blockId, workoutId);
    setBlocks(updated);
  };

  const handleSetActiveBlock = (blockId: string) => {
    const updated = setActiveTrainingBlock(blockId);
    setBlocks(updated);
    const activeB = updated.find((b) => b.id === blockId);
    setInsights(generateSuggestBetterInsights(stravaStats, activeB, goals));
    onShowToast?.("Active training block updated.");
  };

  const handleDeleteBlock = (blockId: string) => {
    const updated = deleteTrainingBlock(blockId);
    setBlocks(updated);
  };

  // Goal Actions
  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim() || !goalTarget.trim()) return;
    const updated = addRunningGoal(goalCategory, goalTitle, goalTarget, goalCurrent || "In Progress", goalDeadline);
    setGoals(updated);
    setGoalTitle("");
    setGoalTarget("");
    setGoalCurrent("");
    setGoalDeadline("");
    setCreatingGoal(false);
    onShowToast?.(`Added goal: ${goalTitle}`);
  };

  const handleToggleGoal = (id: string) => {
    const updated = toggleGoalCompleted(id);
    setGoals(updated);
  };

  const handleDeleteGoal = (id: string) => {
    const updated = deleteRunningGoal(id);
    setGoals(updated);
  };

  // Ask Severus AI for Custom Running Mentorship
  const handleConsultSeverus = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = aiConsultQuery.trim();
    if (!query || isAiConsulting) return;

    setIsAiConsulting(true);
    setAiConsultResponse(null);

    const activeB = blocks.find((b) => b.status === "active");
    const weeklyKm = stravaStats ? stravaStats.weeklyMileageKm : 0;
    const latestRunInfo = stravaStats?.latestRun
      ? `${stravaStats.latestRun.formattedDistance} @ ${stravaStats.latestRun.formattedPace}, avg HR ${stravaStats.latestRun.averageHeartrate || "146"} bpm`
      : "No recent run synced.";

    const prompt =
      `You are Professor Severus Snape serving as Lex Matondo's personal endurance running mentor and academic mentor.\n` +
      `ATHLETE CONTEXT:\n` +
      `- Lex Matondo, 20yo Computer Engineering student (BSCpE) at Cor Jesu College, Davao Region, hybrid athlete.\n` +
      `- Philosophy: Systems over motivation (Atomic Habits).\n` +
      `- Weekly Volume: ${weeklyKm.toFixed(1)} km / ${activeB?.targetWeeklyMileageKm || 45} km target.\n` +
      `- Latest Session: ${latestRunInfo}\n` +
      `- Active Training Block: ${activeB?.title || "Aerobic Base Phase"} (${activeB?.focus || "Zone 2"})\n` +
      `LEX'S QUESTION: "${query}"\n` +
      `Provide a stoic, analytical, and highly actionable 2-to-3 sentence response. Emphasize aerobic base discipline, recovery, or tactical workout adjustment. Always conclude with ", Sir."`;

    try {
      const resp = await sendAIChat(aiConfig, [{ role: "user", content: prompt }]);
      setAiConsultResponse(resp.trim());
      speakText(resp.trim());
    } catch (err) {
      console.error("AI consult failed:", err);
      setAiConsultResponse("My apologies, Sir. I encountered an issue consulting the athletic models.");
    } finally {
      setIsAiConsulting(false);
    }
  };

  if (!open) return null;

  const activeBlock = blocks.find((b) => b.status === "active") || blocks[0];
  const weeklyKm = stravaStats ? stravaStats.weeklyMileageKm : 0;
  const targetKm = activeBlock ? activeBlock.targetWeeklyMileageKm : 45;
  const progressPct = Math.min(100, Math.round((weeklyKm / targetKm) * 100));

  const intensityBadgeClass = (intensity: WorkoutIntensity) => {
    switch (intensity) {
      case "zone2":
        return "badge-zone2";
      case "tempo":
      case "threshold":
        return "badge-tempo";
      case "interval":
        return "badge-interval";
      case "recovery":
        return "badge-recovery";
      case "rest":
      default:
        return "badge-rest";
    }
  };

  return (
    <div className="running-mode-overlay">
      <motion.div
        className="running-mode-window"
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* WINDOW HEADER */}
        <header className="running-mode-header">
          <div className="running-header-left">
            <span className="running-header-icon">
              <Icon name="activity" size={16} />
            </span>
            <div className="running-header-titles">
              <div className="running-header-title-row">
                <h1 className="running-header-title">RUNNING MODE</h1>
                <span className="running-header-kicker">ATHLETIC COMMAND COCKPIT</span>
                <span className="running-status-chip online">
                  <span className="status-dot-pulse" />
                  {stravaStats ? "STRAVA SYNCED" : "OFFLINE TELEMETRY"}
                </span>
              </div>
              <p className="running-header-subtitle">
                Lex Matondo · Cor Jesu BSCpE · Hybrid Endurance Base ({weeklyKm.toFixed(1)} / {targetKm} km this week)
              </p>
            </div>
          </div>

          <div className="running-header-actions">
            <button
              type="button"
              className={`running-btn ${isSyncing ? "spinning" : ""}`}
              onClick={handleSyncStrava}
              disabled={isSyncing}
              title="Sync latest runs with Strava API"
            >
              <Icon name="reset" size={13} />
              <span>{isSyncing ? "Syncing…" : "Sync Live"}</span>
            </button>

            {stravaStats?.latestRun && (
              <button
                type="button"
                className={`running-btn ${runLogged ? "logged" : "primary"}`}
                onClick={handleLogLatestRun}
                disabled={runLogged}
                title="Append latest run telemetry to daily action log"
              >
                <Icon name={runLogged ? "check" : "save"} size={13} />
                <span>{runLogged ? "Run Logged" : "Log Run to Journal"}</span>
              </button>
            )}

            {onMinimizeToFloating && (
              <button
                type="button"
                className="running-btn ghost"
                onClick={onMinimizeToFloating}
                title="Minimize to floating thinking pill"
              >
                <Icon name="minimize" size={13} />
              </button>
            )}

            <button
              type="button"
              className="running-btn close"
              onClick={onClose}
              title="Close Running Mode"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        {/* NAVIGATION TABS */}
        <nav className="running-nav-tabs">
          <button
            type="button"
            className={`running-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <Icon name="activity" size={13} />
            <span>Telemetry Dashboard</span>
          </button>

          <button
            type="button"
            className={`running-tab-btn ${activeTab === "blocks" ? "active" : ""}`}
            onClick={() => setActiveTab("blocks")}
          >
            <Icon name="layers" size={13} />
            <span>Training Blocks</span>
            <span className="tab-counter">{blocks.length}</span>
          </button>

          <button
            type="button"
            className={`running-tab-btn ${activeTab === "goals" ? "active" : ""}`}
            onClick={() => setActiveTab("goals")}
          >
            <Icon name="check" size={13} />
            <span>Running Goals</span>
            <span className="tab-counter">{goals.length}</span>
          </button>

          <button
            type="button"
            className={`running-tab-btn ${activeTab === "suggest" ? "active" : ""}`}
            onClick={() => setActiveTab("suggest")}
          >
            <Icon name="spark" size={13} />
            <span>Suggest Better (AI Coach)</span>
            <span className="tab-pill-highlight">ACTIVE</span>
          </button>
        </nav>

        {/* MAIN BODY CONTENT AREA */}
        <main className="running-mode-content">
          {/* TAB 1: TELEMETRY DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="running-tab-view dashboard-view">
              {/* TOP METRICS STRIP */}
              <div className="running-metrics-grid">
                <div className="running-metric-card highlight">
                  <div className="metric-card-header">
                    <span className="metric-label">WEEKLY VOLUME</span>
                    <span className="metric-tag">MICROCYCLE</span>
                  </div>
                  <div className="metric-value-row">
                    <span className="metric-big-val">{weeklyKm.toFixed(1)}</span>
                    <span className="metric-unit">km</span>
                  </div>
                  <div className="volume-track-wrap">
                    <div className="volume-track-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="metric-sub">
                    {progressPct}% of {targetKm} km target ({stravaStats?.weeklyRunCount || 0} sessions)
                  </span>
                </div>

                <div className="running-metric-card">
                  <div className="metric-card-header">
                    <span className="metric-label">LATEST DISTANCE</span>
                    <span className="metric-tag">{stravaStats?.latestRun?.formattedDate || "RECENT"}</span>
                  </div>
                  <div className="metric-value-row">
                    <span className="metric-big-val">
                      {stravaStats?.latestRun ? stravaStats.latestRun.formattedDistance : "0.0 km"}
                    </span>
                  </div>
                  <span className="metric-sub">
                    {stravaStats?.latestRun ? `Duration: ${stravaStats.latestRun.formattedDuration}` : "Awaiting sync"}
                  </span>
                </div>

                <div className="running-metric-card">
                  <div className="metric-card-header">
                    <span className="metric-label">AVERAGE PACE</span>
                    <span className="metric-tag">SPEED</span>
                  </div>
                  <div className="metric-value-row">
                    <span className="metric-big-val">
                      {stravaStats?.latestRun ? stravaStats.latestRun.formattedPace : "—"}
                    </span>
                  </div>
                  <span className="metric-sub">
                    {stravaStats?.latestRun ? `+${stravaStats.latestRun.elevationGainM}m elevation gain` : "Pace baseline"}
                  </span>
                </div>

                <div className="running-metric-card">
                  <div className="metric-card-header">
                    <span className="metric-label">AVG HEART RATE</span>
                    <span className="metric-tag">ZONE 2 BASE</span>
                  </div>
                  <div className="metric-value-row">
                    <span className="metric-big-val">
                      {stravaStats?.latestRun?.averageHeartrate ? `${stravaStats.latestRun.averageHeartrate}` : "146"}
                    </span>
                    <span className="metric-unit">bpm</span>
                  </div>
                  <span className="metric-sub">Optimal aerobic mitochondrial adaptation</span>
                </div>
              </div>

              {/* LATEST RUN DEEP DIVE & RECENT RUNS FEED */}
              <div className="dashboard-columns">
                <section className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Latest Run Telemetry Breakdown</h3>
                    {stravaStats?.latestRun && (
                      <span className="panel-kicker">{stravaStats.latestRun.name}</span>
                    )}
                  </div>

                  {stravaStats?.latestRun ? (
                    <div className="latest-run-card">
                      <div className="run-card-header">
                        <div className="run-title-wrap">
                          <h4 className="run-title">{stravaStats.latestRun.name}</h4>
                          <span className="run-date">{stravaStats.latestRun.formattedDate}</span>
                        </div>
                        <span className="run-badge">GPS VERIFIED</span>
                      </div>

                      <div className="run-stats-quad">
                        <div className="stat-tile">
                          <span className="stat-tile-label">Distance</span>
                          <span className="stat-tile-val">{stravaStats.latestRun.formattedDistance}</span>
                        </div>
                        <div className="stat-tile">
                          <span className="stat-tile-label">Moving Time</span>
                          <span className="stat-tile-val">{stravaStats.latestRun.formattedDuration}</span>
                        </div>
                        <div className="stat-tile">
                          <span className="stat-tile-label">Average Pace</span>
                          <span className="stat-tile-val">{stravaStats.latestRun.formattedPace}</span>
                        </div>
                        <div className="stat-tile">
                          <span className="stat-tile-label">Heart Rate</span>
                          <span className="stat-tile-val">
                            {stravaStats.latestRun.averageHeartrate ? `${stravaStats.latestRun.averageHeartrate} bpm` : "145 bpm"}
                          </span>
                        </div>
                      </div>

                      {/* Zone Distribution Bar */}
                      <div className="hr-zone-breakdown">
                        <div className="zone-bar-header">
                          <span className="zone-label">Aerobic Target Breakdown</span>
                          <span className="zone-ratio">85% Zone 2 Aerobic Base</span>
                        </div>
                        <div className="zone-multi-bar">
                          <div className="bar-seg z1" style={{ width: "10%" }} title="Zone 1 Recovery" />
                          <div className="bar-seg z2" style={{ width: "75%" }} title="Zone 2 Aerobic Base" />
                          <div className="bar-seg z3" style={{ width: "12%" }} title="Zone 3 Tempo" />
                          <div className="bar-seg z4" style={{ width: "3%" }} title="Zone 4 Threshold" />
                        </div>
                        <div className="zone-legend">
                          <span className="legend-item"><span className="dot z1" />Z1 Warmup</span>
                          <span className="legend-item"><span className="dot z2" />Z2 Aerobic (Primary)</span>
                          <span className="legend-item"><span className="dot z3" />Z3 Tempo</span>
                          <span className="legend-item"><span className="dot z4" />Z4 Threshold</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-panel-notice">
                      <Icon name="activity" size={24} />
                      <p>No Strava runs detected in local cache. Click "Sync Live" above to connect.</p>
                    </div>
                  )}
                </section>

                <section className="dashboard-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Active Microcycle Status</h3>
                    <span className="panel-kicker">{activeBlock?.title || "Base Phase"}</span>
                  </div>

                  <div className="active-block-summary-card">
                    <div className="block-summary-header">
                      <div>
                        <span className="block-pill active">ACTIVE BLOCK</span>
                        <h4 className="block-summary-title">{activeBlock?.title}</h4>
                      </div>
                      <span className="block-duration-tag">
                        Week {activeBlock?.currentWeek || 1} of {activeBlock?.durationWeeks || 4}
                      </span>
                    </div>

                    <p className="block-focus-desc">{activeBlock?.focus}</p>

                    <div className="block-mini-schedule">
                      {activeBlock?.workouts.slice(0, 4).map((w) => (
                        <div key={w.id} className={`mini-workout-row ${w.completed ? "done" : ""}`}>
                          <span className="mini-day">{w.day}</span>
                          <span className="mini-title">{w.title}</span>
                          {w.distanceKm && <span className="mini-dist">{w.distanceKm} km</span>}
                          <span className={`intensity-badge ${intensityBadgeClass(w.intensity)}`}>
                            {w.intensity.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="view-all-block-btn"
                      onClick={() => setActiveTab("blocks")}
                    >
                      <span>Manage Full Weekly Schedule</span>
                      <Icon name="chevron-right" size={12} />
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: TRAINING BLOCKS */}
          {activeTab === "blocks" && (
            <div className="running-tab-view blocks-view">
              <div className="tab-view-toolbar">
                <div>
                  <h2 className="view-heading">Training Blocks & Periodization</h2>
                  <p className="view-subheading">
                    Structured microcycles and mesocycles engineered for aerobic capacity and progressive volume.
                  </p>
                </div>
                <button
                  type="button"
                  className="running-btn primary"
                  onClick={() => setCreatingBlock((prev) => !prev)}
                >
                  <Icon name="plus" size={13} />
                  <span>{creatingBlock ? "Cancel" : "New Training Block"}</span>
                </button>
              </div>

              {/* CREATE BLOCK FORM MODAL */}
              {creatingBlock && (
                <form className="block-creator-card" onSubmit={handleCreateBlock}>
                  <h3 className="creator-card-title">Configure New Training Microcycle</h3>
                  <div className="creator-form-grid">
                    <div className="form-field full">
                      <label>Block Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Aerobic Engine Build, Half Marathon Cycle..."
                        value={blockTitle}
                        onChange={(e) => setBlockTitle(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-field">
                      <label>Target Weekly Mileage (km)</label>
                      <input
                        type="number"
                        min="10"
                        max="150"
                        value={blockWeeklyKm}
                        onChange={(e) => setBlockWeeklyKm(parseFloat(e.target.value) || 45)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Duration (Weeks)</label>
                      <input
                        type="number"
                        min="1"
                        max="16"
                        value={blockWeeks}
                        onChange={(e) => setBlockWeeks(parseInt(e.target.value, 10) || 4)}
                        required
                      />
                    </div>
                    <div className="form-field full">
                      <label>Primary Focus & Physiological Objective</label>
                      <input
                        type="text"
                        placeholder="e.g. Zone 2 capillary beds, lactate threshold, long run progression..."
                        value={blockFocus}
                        onChange={(e) => setBlockFocus(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="creator-actions">
                    <button type="button" className="running-btn ghost" onClick={() => setCreatingBlock(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="running-btn primary">
                      Save & Activate Block
                    </button>
                  </div>
                </form>
              )}

              {/* LIST OF TRAINING BLOCKS */}
              <div className="training-blocks-stack">
                {blocks.map((block) => {
                  const isActive = block.status === "active";
                  return (
                    <div key={block.id} className={`block-card-container ${isActive ? "active" : ""}`}>
                      <div className="block-card-header">
                        <div className="block-header-left">
                          <span className={`block-status-badge ${block.status}`}>
                            {block.status.toUpperCase()}
                          </span>
                          <h3 className="block-title">{block.title}</h3>
                          <span className="block-specs">
                            {block.targetWeeklyMileageKm} km/week · {block.durationWeeks} Weeks
                          </span>
                        </div>

                        <div className="block-header-actions">
                          {!isActive && (
                            <button
                              type="button"
                              className="running-btn ghost"
                              onClick={() => handleSetActiveBlock(block.id)}
                            >
                              Set as Active
                            </button>
                          )}
                          <button
                            type="button"
                            className="running-btn close"
                            onClick={() => handleDeleteBlock(block.id)}
                            title="Delete block"
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      </div>

                      <p className="block-focus-text">
                        <strong>Focus:</strong> {block.focus}
                      </p>

                      {/* 7-DAY WORKOUT SCHEDULE GRID */}
                      <div className="workouts-week-grid">
                        {block.workouts.map((workout) => (
                          <div
                            key={workout.id}
                            className={`workout-day-card ${workout.completed ? "completed" : ""}`}
                            onClick={() => handleToggleWorkout(block.id, workout.id)}
                          >
                            <div className="day-card-top">
                              <span className="day-name">{workout.day}</span>
                              <span className={`workout-checkbox ${workout.completed ? "checked" : ""}`}>
                                {workout.completed && <Icon name="check" size={10} />}
                              </span>
                            </div>

                            <span className="workout-title">{workout.title}</span>

                            <div className="day-card-bottom">
                              {workout.distanceKm ? (
                                <span className="workout-km">{workout.distanceKm} km</span>
                              ) : (
                                <span className="workout-km rest">—</span>
                              )}
                              <span className={`intensity-pill ${intensityBadgeClass(workout.intensity)}`}>
                                {workout.intensity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: RUNNING GOALS */}
          {activeTab === "goals" && (
            <div className="running-tab-view goals-view">
              <div className="tab-view-toolbar">
                <div>
                  <h2 className="view-heading">Running Goals & Performance Benchmarks</h2>
                  <p className="view-subheading">
                    Quantitative targets for weekly volume, target race pace, aerobic ratio, and consistency streaks.
                  </p>
                </div>
                <button
                  type="button"
                  className="running-btn primary"
                  onClick={() => setCreatingGoal((prev) => !prev)}
                >
                  <Icon name="plus" size={13} />
                  <span>{creatingGoal ? "Cancel" : "Add Goal"}</span>
                </button>
              </div>

              {/* CREATE GOAL FORM */}
              {creatingGoal && (
                <form className="goal-creator-card" onSubmit={handleCreateGoal}>
                  <h3 className="creator-card-title">Add New Running Objective</h3>
                  <div className="creator-form-grid">
                    <div className="form-field">
                      <label>Category</label>
                      <select
                        value={goalCategory}
                        onChange={(e) => setGoalCategory(e.target.value as any)}
                      >
                        <option value="mileage">Weekly Mileage</option>
                        <option value="pace">Target Pace</option>
                        <option value="race">Race / Time Trial</option>
                        <option value="habit">Consistency Habit</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Goal Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Sub-1:50 Half Marathon"
                        value={goalTitle}
                        onChange={(e) => setGoalTitle(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-field">
                      <label>Target Value</label>
                      <input
                        type="text"
                        placeholder="e.g. 5:12 /km or 50 km/week"
                        value={goalTarget}
                        onChange={(e) => setGoalTarget(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Current Status / Baseline</label>
                      <input
                        type="text"
                        placeholder="e.g. 5:25 /km or 35 km"
                        value={goalCurrent}
                        onChange={(e) => setGoalCurrent(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="creator-actions">
                    <button type="button" className="running-btn ghost" onClick={() => setCreatingGoal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="running-btn primary">
                      Save Goal
                    </button>
                  </div>
                </form>
              )}

              {/* GOALS GRID */}
              <div className="goals-grid-cards">
                {goals.map((goal) => (
                  <div key={goal.id} className={`goal-card ${goal.completed ? "completed" : ""}`}>
                    <div className="goal-card-top">
                      <span className={`goal-category-tag ${goal.category}`}>
                        {goal.category.toUpperCase()}
                      </span>
                      <button
                        type="button"
                        className="goal-delete-btn"
                        onClick={() => handleDeleteGoal(goal.id)}
                        title="Delete goal"
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </div>

                    <h4 className="goal-title">{goal.title}</h4>

                    <div className="goal-metrics-row">
                      <div className="goal-metric">
                        <span className="gm-label">TARGET</span>
                        <span className="gm-val target">{goal.targetValue}</span>
                      </div>
                      <div className="goal-metric">
                        <span className="gm-label">CURRENT</span>
                        <span className="gm-val">{goal.currentValue}</span>
                      </div>
                    </div>

                    <div className="goal-progress-wrap">
                      <div className="goal-progress-bar">
                        <div className="goal-progress-fill" style={{ width: `${goal.progressPct}%` }} />
                      </div>
                      <span className="goal-pct-text">{goal.progressPct}% Complete</span>
                    </div>

                    <button
                      type="button"
                      className={`goal-toggle-btn ${goal.completed ? "done" : ""}`}
                      onClick={() => handleToggleGoal(goal.id)}
                    >
                      <Icon name={goal.completed ? "check" : "clock"} size={12} />
                      <span>{goal.completed ? "Goal Completed" : "Mark as Achieved"}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SUGGEST BETTER (AI COACH) */}
          {activeTab === "suggest" && (
            <div className="running-tab-view suggest-view">
              <div className="tab-view-toolbar">
                <div>
                  <h2 className="view-heading">Suggest Better · AI Athletic Intelligence</h2>
                  <p className="view-subheading">
                    Real-time physiology, recovery warnings, volume distribution, and Atomic Habits systems mentorship.
                  </p>
                </div>
              </div>

              {/* INTERACTIVE AI COACH MENTORSHIP BAR */}
              <div className="ai-coach-consult-box">
                <div className="coach-box-header">
                  <span className="coach-avatar">
                    <Icon name="brain" size={14} />
                  </span>
                  <div>
                    <h3 className="coach-box-title">Consult Professor Severus on Training</h3>
                    <p className="coach-box-sub">
                      Ask about workout adjustments, pace targets, nutrition, or recovery cadence.
                    </p>
                  </div>
                </div>

                <form className="coach-input-form" onSubmit={handleConsultSeverus}>
                  <input
                    type="text"
                    className="coach-text-input"
                    placeholder="Ask Severus (e.g. Should I do strides today after yesterday's 10k?)"
                    value={aiConsultQuery}
                    onChange={(e) => setAiConsultQuery(e.target.value)}
                    disabled={isAiConsulting}
                  />
                  <button
                    type="submit"
                    className="running-btn primary"
                    disabled={isAiConsulting || !aiConsultQuery.trim()}
                  >
                    <Icon name="send" size={13} />
                    <span>{isAiConsulting ? "Consulting…" : "Ask Severus"}</span>
                  </button>
                </form>

                <AnimatePresence>
                  {aiConsultResponse && (
                    <motion.div
                      className="coach-response-bubble"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                    >
                      <div className="coach-bubble-author">
                        <Icon name="brain" size={12} />
                        <span>Professor Severus</span>
                      </div>
                      <p className="coach-bubble-text">{aiConsultResponse}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* DYNAMIC SYSTEM INSIGHTS GRID */}
              <div className="insights-grid">
                {insights.map((insight, idx) => (
                  <div key={idx} className={`insight-card priority-${insight.priority}`}>
                    <div className="insight-card-header">
                      <span className={`insight-cat-badge ${insight.category}`}>
                        {insight.category.toUpperCase()}
                      </span>
                      <span className={`insight-priority-badge ${insight.priority}`}>
                        {insight.priority.toUpperCase()} PRIORITY
                      </span>
                    </div>

                    <h4 className="insight-headline">{insight.headline}</h4>
                    <p className="insight-detail">{insight.detail}</p>

                    <div className="insight-action-bar">
                      <span className="action-tag">RECOMMENDED ACTION:</span>
                      <p className="action-text">{insight.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </motion.div>
    </div>
  );
}
