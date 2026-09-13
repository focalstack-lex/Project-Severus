import { useState, useEffect, useCallback } from "react";
import Icon from "./Icon";
import {
  loadAcademicSprints,
  addAcademicSprint,
  toggleAcademicSprint,
  deleteAcademicSprint,
  setPrimaryAcademicSprint,
  type SprintCategory,
} from "../lib/academicSprints";
import {
  loadCachedStravaStats,
  fetchStravaAthleteStats,
  isStravaConfigured,
  type StravaAthleteStats,
} from "../lib/strava";
import { appendJournal, readTodayJournal } from "../lib/tauri";

interface Props {
  onOpenJournalModal?: () => void;
  onOpenSettings?: () => void;
}

export default function DualPacingCockpit({ onOpenJournalModal, onOpenSettings }: Props) {
  // Academic Sprints State
  const [sprintState, setSprintState] = useState(loadAcademicSprints);
  const [newSprintTitle, setNewSprintTitle] = useState("");
  const [newSprintCategory, setNewSprintCategory] = useState<SprintCategory>("lab");
  const [newSprintIsPrimary, setNewSprintIsPrimary] = useState(false);
  const [addingSprint, setAddingSprint] = useState(false);

  // Strava Telemetry State
  const [stravaStats, setStravaStats] = useState<StravaAthleteStats | null>(loadCachedStravaStats);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [weeklyTargetKm, setWeeklyTargetKm] = useState<number>(() => {
    const saved = localStorage.getItem("severus_weekly_mileage_target");
    return saved ? parseFloat(saved) || 45 : 45;
  });
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(weeklyTargetKm));

  // Daily Journal Feed State
  const [todayJournalRaw, setTodayJournalRaw] = useState("");
  const [quickLogInput, setQuickLogInput] = useState("");
  const [loggingJournal, setLoggingJournal] = useState(false);
  const [runAlreadyLogged, setRunAlreadyLogged] = useState(false);

  // Load and refresh today's journal
  const refreshJournal = useCallback(async () => {
    try {
      const content = await readTodayJournal();
      setTodayJournalRaw(content || "");
    } catch (err) {
      console.warn("Could not read today's journal:", err);
    }
  }, []);

  useEffect(() => {
    void refreshJournal();
  }, [refreshJournal]);

  // Check if latest run is already in today's journal
  useEffect(() => {
    if (stravaStats?.latestRun && todayJournalRaw) {
      const runId = String(stravaStats.latestRun.id);
      const runName = stravaStats.latestRun.name;
      const isLogged = todayJournalRaw.includes(runName) || todayJournalRaw.includes(runId);
      setRunAlreadyLogged(isLogged);
    } else {
      setRunAlreadyLogged(false);
    }
  }, [stravaStats, todayJournalRaw]);

  // Listen to external stats & sprints events
  useEffect(() => {
    const handleStrava = (e: Event) => {
      const custom = e as CustomEvent<StravaAthleteStats>;
      if (custom.detail) setStravaStats(custom.detail);
    };
    const handleSprints = () => {
      setSprintState(loadAcademicSprints());
    };

    window.addEventListener("severus:strava-stats-updated", handleStrava);
    window.addEventListener("severus:academic-sprints-changed", handleSprints);
    return () => {
      window.removeEventListener("severus:strava-stats-updated", handleStrava);
      window.removeEventListener("severus:academic-sprints-changed", handleSprints);
    };
  }, []);

  // Academic Sprint actions
  const handleToggleSprint = async (id: string) => {
    const { state, completedItem } = toggleAcademicSprint(id);
    setSprintState(state);

    if (completedItem && completedItem.completed) {
      const categoryLabel = completedItem.category.toUpperCase();
      try {
        await appendJournal(`Completed Academic Sprint [${categoryLabel}]: ${completedItem.title}`);
        void refreshJournal();
      } catch (err) {
        console.warn("Failed to auto-journal completed sprint:", err);
      }
    }
  };

  const handleAddSprint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSprintTitle.trim()) return;
    const next = addAcademicSprint(newSprintTitle, newSprintCategory, newSprintIsPrimary);
    setSprintState(next);
    setNewSprintTitle("");
    setAddingSprint(false);
    setNewSprintIsPrimary(false);
  };

  const handleDeleteSprint = (id: string) => {
    const next = deleteAcademicSprint(id);
    setSprintState(next);
  };

  const handleSetPrimary = (id: string) => {
    const next = setPrimaryAcademicSprint(id);
    setSprintState(next);
  };

  // Strava sync action
  const handleSyncStrava = async () => {
    setSyncingStrava(true);
    try {
      const stats = await fetchStravaAthleteStats();
      setStravaStats(stats);
    } catch (err) {
      console.warn("Strava sync failed:", err);
    } finally {
      setSyncingStrava(false);
    }
  };

  // Log Latest Strava Run to Journal
  const handleLogRunToJournal = async () => {
    if (!stravaStats?.latestRun) return;
    const r = stravaStats.latestRun;
    const hrText = r.averageHeartrate ? ` · ${r.averageHeartrate} bpm` : "";
    const elevText = r.elevationGainM > 0 ? ` · ${r.elevationGainM}m elevation` : "";
    const entry = `🏃 Strava Run: ${r.name} (${r.formattedDistance} in ${r.formattedDuration} @ ${r.formattedPace}${hrText}${elevText})`;

    try {
      await appendJournal(entry);
      setRunAlreadyLogged(true);
      void refreshJournal();
    } catch (err) {
      console.error("Failed to append run to journal:", err);
    }
  };

  // Manual Quick Log action
  const handleQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickLogInput.trim();
    if (!text) return;

    setLoggingJournal(true);
    try {
      await appendJournal(text);
      setQuickLogInput("");
      void refreshJournal();
    } catch (err) {
      console.error("Failed to append journal:", err);
    } finally {
      setLoggingJournal(false);
    }
  };

  // Save weekly target km
  const handleSaveTarget = () => {
    const val = parseFloat(targetInput);
    if (!isNaN(val) && val > 0) {
      setWeeklyTargetKm(val);
      localStorage.setItem("severus_weekly_mileage_target", String(val));
    }
    setEditingTarget(false);
  };

  // Parse today's journal lines for clean display
  const journalEntries = todayJournalRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .map((line) => {
      const match = line.match(/^- \[(\d{2}:\d{2})\]\s*(.*)$/);
      if (match) {
        return { time: match[1], text: match[2] };
      }
      return { time: "--:--", text: line.replace(/^- /, "") };
    })
    .reverse(); // most recent at top

  // Mileage progress calculation
  const weeklyKm = stravaStats ? stravaStats.weeklyMileageKm : 0;
  const progressPercent = Math.min(100, Math.round((weeklyKm / weeklyTargetKm) * 100));

  // Determine recovery recommendation
  const getRecoveryAdvice = () => {
    if (!stravaStats?.latestRun) {
      return { label: "Ready to Train", detail: "No runs recorded this week yet. Optimal for an aerobic base run." };
    }
    const latest = stravaStats.latestRun;
    const runDate = new Date(latest.startDate);
    const hoursSince = (Date.now() - runDate.getTime()) / (1000 * 3600);

    if (hoursSince < 12) {
      return { label: "Hydrate & Refuel", detail: `Ran ${latest.formattedDistance} recently. Prioritize protein and electrolytes.` };
    }
    if (hoursSince < 36 && latest.distanceKm >= 14) {
      return { label: "Active Recovery", detail: "Long run logged yesterday. Keep today strictly Zone 2 or cross-train." };
    }
    if (weeklyKm >= weeklyTargetKm) {
      return { label: "Target Achieved", detail: `${weeklyKm.toFixed(1)} km logged. Maintain steady strides or rest.` };
    }
    return { label: "Zone 2 Aerobic Base", detail: `${(weeklyTargetKm - weeklyKm).toFixed(1)} km remaining toward weekly target.` };
  };

  const recovery = getRecoveryAdvice();
  const primarySprint = sprintState.sprints.find((s) => s.isPrimary);
  const secondarySprints = sprintState.sprints.filter((s) => !s.isPrimary);

  return (
    <div className="dual-pacing-cockpit">
      {/* COCKPIT GRID: 2 COLUMNS (ACADEMIC × ATHLETIC) */}
      <div className="cockpit-grid">
        {/* COLUMN 1: ACADEMIC ENGINEERING SPRINTS */}
        <section className="cockpit-card academic-card">
          <div className="cockpit-card-header">
            <div className="card-header-left">
              <span className="card-category-tag academic">COMPUTER ENGINEERING</span>
              <h2 className="cockpit-card-title">Academic Engineering Sprints</h2>
            </div>
            <button
              type="button"
              className="cockpit-action-btn"
              onClick={() => setAddingSprint((prev) => !prev)}
              title="Add a new academic sprint"
            >
              <Icon name="plus" size={12} />
              <span>Sprint</span>
            </button>
          </div>

          {/* New Sprint Quick Creator Form */}
          {addingSprint && (
            <form className="sprint-creator-form" onSubmit={handleAddSprint}>
              <input
                type="text"
                className="sprint-input"
                placeholder="Sprint title (e.g. Microcontroller UART Lab)..."
                value={newSprintTitle}
                onChange={(e) => setNewSprintTitle(e.target.value)}
                autoFocus
              />
              <div className="sprint-creator-controls">
                <select
                  className="sprint-select"
                  value={newSprintCategory}
                  onChange={(e) => setNewSprintCategory(e.target.value as SprintCategory)}
                >
                  <option value="lab">#lab</option>
                  <option value="exam">#exam</option>
                  <option value="project">#project</option>
                  <option value="study">#study</option>
                </select>

                <label className="sprint-checkbox-label">
                  <input
                    type="checkbox"
                    checked={newSprintIsPrimary}
                    onChange={(e) => setNewSprintIsPrimary(e.target.checked)}
                  />
                  <span>High-Leverage</span>
                </label>

                <div className="sprint-creator-btns">
                  <button type="button" className="btn-ghost" onClick={() => setAddingSprint(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-accent">
                    Add
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Primary High-Leverage Sprint Box */}
          <div className="primary-sprint-box">
            <div className="primary-sprint-kicker">
              <span className="primary-dot" />
              <span>TODAY'S 1 HIGH-LEVERAGE OBJECTIVE</span>
            </div>
            {primarySprint ? (
              <div className={`sprint-item primary ${primarySprint.completed ? "completed" : ""}`}>
                <button
                  type="button"
                  className={`sprint-checkbox ${primarySprint.completed ? "checked" : ""}`}
                  onClick={() => void handleToggleSprint(primarySprint.id)}
                  title={primarySprint.completed ? "Mark incomplete" : "Mark completed (auto-journals)"}
                >
                  {primarySprint.completed && <Icon name="check" size={12} />}
                </button>
                <div className="sprint-item-content">
                  <span className="sprint-item-title">{primarySprint.title}</span>
                  <span className="sprint-category-pill">#{primarySprint.category}</span>
                </div>
                <button
                  type="button"
                  className="sprint-del-btn"
                  onClick={() => handleDeleteSprint(primarySprint.id)}
                  title="Remove sprint"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ) : (
              <div className="empty-primary-sprint">
                <span>No primary objective set. Designate your single highest leverage task for today.</span>
              </div>
            )}
          </div>

          {/* Secondary Milestones List */}
          <div className="secondary-sprints-list">
            <div className="secondary-kicker">SECONDARY MILESTONES ({secondarySprints.length})</div>
            {secondarySprints.map((item) => (
              <div key={item.id} className={`sprint-item ${item.completed ? "completed" : ""}`}>
                <button
                  type="button"
                  className={`sprint-checkbox ${item.completed ? "checked" : ""}`}
                  onClick={() => void handleToggleSprint(item.id)}
                  title={item.completed ? "Mark incomplete" : "Mark completed (auto-journals)"}
                >
                  {item.completed && <Icon name="check" size={11} />}
                </button>
                <div className="sprint-item-content">
                  <span className="sprint-item-title">{item.title}</span>
                  <span className="sprint-category-pill">#{item.category}</span>
                </div>
                <div className="sprint-item-actions">
                  <button
                    type="button"
                    className="sprint-promote-btn"
                    onClick={() => handleSetPrimary(item.id)}
                    title="Make High-Leverage Primary"
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    className="sprint-del-btn"
                    onClick={() => handleDeleteSprint(item.id)}
                    title="Remove"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              </div>
            ))}
            {secondarySprints.length === 0 && (
              <div className="empty-secondary-note">No secondary tasks scheduled. Click "+ Sprint" to add.</div>
            )}
          </div>
        </section>

        {/* COLUMN 2: ATHLETIC STRAVA RUNNING HUB */}
        <section className="cockpit-card athletic-card">
          <div className="cockpit-card-header">
            <div className="card-header-left">
              <span className="card-category-tag athletic">STRAVA TELEMETRY</span>
              <h2 className="cockpit-card-title">Athletic Running Volume</h2>
            </div>
            {isStravaConfigured() ? (
              <button
                type="button"
                className="cockpit-action-btn"
                disabled={syncingStrava}
                onClick={handleSyncStrava}
                title="Sync latest runs from Strava"
              >
                <Icon name="reset" size={12} />
                <span>{syncingStrava ? "Syncing…" : "Sync"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="cockpit-action-btn accent"
                onClick={onOpenSettings}
                title="Connect Strava API"
              >
                <span>Connect</span>
              </button>
            )}
          </div>

          {/* Weekly Mileage Progress Meter */}
          <div className="mileage-meter-box">
            <div className="meter-header">
              <div className="meter-header-left">
                <span className="meter-value-big">{weeklyKm.toFixed(1)}</span>
                <span className="meter-unit">km</span>
                <span className="meter-divider">/</span>
                {editingTarget ? (
                  <span className="meter-edit-wrap">
                    <input
                      type="number"
                      className="meter-input"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      onBlur={handleSaveTarget}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveTarget()}
                      autoFocus
                    />
                    <span className="meter-unit">km</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="meter-target-btn"
                    onClick={() => setEditingTarget(true)}
                    title="Click to edit weekly target"
                  >
                    <span>{weeklyTargetKm} km</span>
                    <span className="meter-edit-icon">✎</span>
                  </button>
                )}
              </div>
              <span className="meter-pct-badge">{progressPercent}%</span>
            </div>

            {/* Visual Progress Bar */}
            <div className="mileage-progress-track">
              <div
                className="mileage-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="meter-sub-info">
              <span>{stravaStats ? `${stravaStats.weeklyRunCount} runs completed this week` : "Connect Strava to view runs"}</span>
              <span className="recovery-pill" title={recovery.detail}>
                {recovery.label}
              </span>
            </div>
          </div>

          {/* Latest Run Debrief Card */}
          {stravaStats?.latestRun ? (
            <div className="latest-run-cockpit-card">
              <div className="latest-run-top">
                <div className="latest-run-info">
                  <span className="run-icon">🏃</span>
                  <div className="run-meta-col">
                    <span className="run-name">{stravaStats.latestRun.name}</span>
                    <span className="run-date">{stravaStats.latestRun.formattedDate}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={`run-journal-btn ${runAlreadyLogged ? "logged" : ""}`}
                  onClick={handleLogRunToJournal}
                  disabled={runAlreadyLogged}
                  title={runAlreadyLogged ? "Already logged in today's journal" : "Log this run to today's journal"}
                >
                  <Icon name={runAlreadyLogged ? "check" : "pen"} size={11} />
                  <span>{runAlreadyLogged ? "Logged" : "Log to Journal"}</span>
                </button>
              </div>

              <div className="run-stats-pills">
                <div className="run-stat-pill">
                  <span className="label">DIST</span>
                  <span className="val">{stravaStats.latestRun.formattedDistance}</span>
                </div>
                <div className="run-stat-pill">
                  <span className="label">PACE</span>
                  <span className="val">{stravaStats.latestRun.formattedPace}</span>
                </div>
                <div className="run-stat-pill">
                  <span className="label">TIME</span>
                  <span className="val">{stravaStats.latestRun.formattedDuration}</span>
                </div>
                {stravaStats.latestRun.averageHeartrate && (
                  <div className="run-stat-pill">
                    <span className="label">HEART</span>
                    <span className="val">{stravaStats.latestRun.averageHeartrate} bpm</span>
                  </div>
                )}
                {stravaStats.latestRun.elevationGainM > 0 && (
                  <div className="run-stat-pill">
                    <span className="label">ELEV</span>
                    <span className="val">{stravaStats.latestRun.elevationGainM}m</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-run-card">
              <span>Connect your Strava account in Settings to see live running telemetry and auto-log runs.</span>
            </div>
          )}
        </section>
      </div>

      {/* DAILY ACTION LOG TIMELINE & QUICK LOG STREAM */}
      <section className="cockpit-journal-section">
        <div className="journal-section-header">
          <div className="journal-header-left">
            <Icon name="pen" size={13} />
            <h3 className="journal-section-title">Today's Action Log</h3>
            <span className="journal-count-pill">{journalEntries.length} entries</span>
          </div>

          {onOpenJournalModal && (
            <button
              type="button"
              className="journal-full-btn"
              onClick={onOpenJournalModal}
              title="Open full journal workspace (Ctrl+J)"
            >
              <span>Full Journal (Ctrl+J)</span>
              <Icon name="chevron-right" size={11} />
            </button>
          )}
        </div>

        {/* Quick Log Input Box */}
        <form className="cockpit-quick-log-form" onSubmit={handleQuickLog}>
          <input
            type="text"
            className="cockpit-quick-log-input"
            placeholder="Log an action, insight, or achievement to today's journal..."
            value={quickLogInput}
            onChange={(e) => setQuickLogInput(e.target.value)}
          />
          <button
            type="submit"
            className="cockpit-quick-log-btn"
            disabled={!quickLogInput.trim() || loggingJournal}
          >
            <span>{loggingJournal ? "Logging…" : "Log Entry"}</span>
          </button>
        </form>

        {/* Live Entries Timeline Stream */}
        <div className="cockpit-journal-timeline">
          {journalEntries.map((entry, idx) => (
            <div key={`${entry.time}-${idx}`} className="journal-timeline-row">
              <span className="timeline-time">{entry.time}</span>
              <span className="timeline-text">{entry.text}</span>
            </div>
          ))}
          {journalEntries.length === 0 && (
            <div className="journal-timeline-empty">
              <span>No entries logged for today yet. Use the quick logger above or complete an academic sprint.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
