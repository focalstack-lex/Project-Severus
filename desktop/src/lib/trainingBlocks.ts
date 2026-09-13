import { StravaAthleteStats } from "./strava";

export type WorkoutIntensity = "recovery" | "zone2" | "tempo" | "threshold" | "interval" | "rest";

export interface TrainingWorkout {
  id: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  title: string;
  distanceKm?: number;
  intensity: WorkoutIntensity;
  notes?: string;
  completed?: boolean;
}

export interface TrainingBlock {
  id: string;
  title: string;
  subtitle?: string;
  targetWeeklyMileageKm: number;
  durationWeeks: number;
  currentWeek: number;
  focus: string;
  status: "active" | "planned" | "completed";
  workouts: TrainingWorkout[];
  createdAt: string;
}

export interface RunningGoal {
  id: string;
  category: "mileage" | "pace" | "race" | "habit";
  title: string;
  targetValue: string;
  currentValue: string;
  progressPct: number;
  deadline?: string;
  completed: boolean;
}

export interface SuggestionInsight {
  category: "recovery" | "volume" | "intensity" | "habits" | "tactical";
  headline: string;
  detail: string;
  action: string;
  priority: "high" | "medium" | "low";
}

const STORAGE_KEY_BLOCKS = "severus_running_training_blocks";
const STORAGE_KEY_GOALS = "severus_running_goals";

// Default curated templates tailored for Lex Matondo (Hybrid Athlete / BSCpE student)
export const DEFAULT_TRAINING_BLOCKS: TrainingBlock[] = [
  {
    id: "block-aerobic-base-01",
    title: "Aerobic Base Engine (45 km)",
    subtitle: "Zone 2 Cardiovascular Base & Musculoskeletal Resilience",
    targetWeeklyMileageKm: 45,
    durationWeeks: 4,
    currentWeek: 2,
    focus: "Mitochondrial density, Zone 2 capillary bed expansion, and consistent habit loops.",
    status: "active",
    createdAt: new Date().toISOString(),
    workouts: [
      {
        id: "w-mon",
        day: "Mon",
        title: "Rest & Active Mobility",
        intensity: "rest",
        notes: "Full rest, foam rolling, dynamic hip mobility. Zero aerobic strain.",
        completed: true,
      },
      {
        id: "w-tue",
        day: "Tue",
        title: "Aerobic Zone 2 Foundation",
        distanceKm: 8.0,
        intensity: "zone2",
        notes: "Target HR 135–148 bpm. Conversational breathing rhythm.",
        completed: true,
      },
      {
        id: "w-wed",
        day: "Wed",
        title: "Recovery Flush & Core",
        distanceKm: 6.0,
        intensity: "recovery",
        notes: "Very easy recovery pace. Follow with 15-min core & glute stability.",
        completed: true,
      },
      {
        id: "w-thu",
        day: "Thu",
        title: "Steady Aerobic + 5x Strides",
        distanceKm: 10.0,
        intensity: "zone2",
        notes: "8 km steady Zone 2 + 5x 20-second fast neuromuscular strides.",
        completed: false,
      },
      {
        id: "w-fri",
        day: "Fri",
        title: "Cross-Training / Rest",
        intensity: "rest",
        notes: "Full mental recharge before weekend long mileage block.",
        completed: false,
      },
      {
        id: "w-sat",
        day: "Sat",
        title: "Endurance Long Run",
        distanceKm: 16.0,
        intensity: "zone2",
        notes: "Controlled negative split, deliberate fueling every 45 mins. Hydrate well.",
        completed: false,
      },
      {
        id: "w-sun",
        day: "Sun",
        title: "Shakeout / Recovery Stroll",
        distanceKm: 5.0,
        intensity: "recovery",
        notes: "Low impact flush out. Prepares legs for next week's microcycle.",
        completed: false,
      },
    ],
  },
  {
    id: "block-half-marathon-02",
    title: "Half Marathon Progression (52 km)",
    subtitle: "Lactate Threshold & Specific Race Pace Cadence",
    targetWeeklyMileageKm: 52,
    durationWeeks: 6,
    currentWeek: 1,
    focus: "Progressive threshold blocks, race pace familiarity (5:10–5:15 /km).",
    status: "planned",
    createdAt: new Date().toISOString(),
    workouts: [
      { id: "w2-mon", day: "Mon", title: "Rest & Mobility", intensity: "rest", completed: false },
      { id: "w2-tue", day: "Tue", title: "Easy Aerobic", distanceKm: 9.0, intensity: "zone2", completed: false },
      { id: "w2-wed", day: "Wed", title: "Tempo Interval: 3x 2km @ Threshold", distanceKm: 11.0, intensity: "tempo", completed: false },
      { id: "w2-thu", day: "Thu", title: "Easy Recovery Run", distanceKm: 7.0, intensity: "recovery", completed: false },
      { id: "w2-fri", day: "Fri", title: "Rest & Mobility", intensity: "rest", completed: false },
      { id: "w2-sat", day: "Sat", title: "Long Run with Fast Finish", distanceKm: 19.0, intensity: "zone2", completed: false },
      { id: "w2-sun", day: "Sun", title: "Shakeout Easy", distanceKm: 6.0, intensity: "recovery", completed: false },
    ],
  },
];

export const DEFAULT_RUNNING_GOALS: RunningGoal[] = [
  {
    id: "goal-weekly-vol",
    category: "mileage",
    title: "Weekly Mileage Benchmark",
    targetValue: "45.0 km/week",
    currentValue: "32.4 km",
    progressPct: 72,
    deadline: "Weekly Sunday 23:59",
    completed: false,
  },
  {
    id: "goal-aerobic-ratio",
    category: "habit",
    title: "80/20 Polarized Discipline",
    targetValue: "80% Zone 2 Aerobic",
    currentValue: "85% Volume in Z2",
    progressPct: 90,
    deadline: "Current Block",
    completed: false,
  },
  {
    id: "goal-half-marathon",
    category: "race",
    title: "Half Marathon Target Pace",
    targetValue: "Sub-1:50:00 (5:12 /km)",
    currentValue: "Current Baseline: 5:20 /km",
    progressPct: 65,
    deadline: "Target Event",
    completed: false,
  },
  {
    id: "goal-consistency-streak",
    category: "habit",
    title: "Weekly Session Consistency",
    targetValue: "4-5 Run Sessions / Week",
    currentValue: "3 Sessions Logged",
    progressPct: 75,
    deadline: "Ongoing",
    completed: false,
  },
];

export function loadTrainingBlocks(): TrainingBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BLOCKS);
    if (!raw) return DEFAULT_TRAINING_BLOCKS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TRAINING_BLOCKS;
  } catch {
    return DEFAULT_TRAINING_BLOCKS;
  }
}

export function saveTrainingBlocks(blocks: TrainingBlock[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(blocks));
    window.dispatchEvent(new CustomEvent("severus:training-blocks-changed", { detail: blocks }));
  } catch (err) {
    console.warn("Failed saving training blocks to storage:", err);
  }
}

export function loadRunningGoals(): RunningGoal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOALS);
    if (!raw) return DEFAULT_RUNNING_GOALS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RUNNING_GOALS;
  } catch {
    return DEFAULT_RUNNING_GOALS;
  }
}

export function saveRunningGoals(goals: RunningGoal[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent("severus:running-goals-changed", { detail: goals }));
  } catch (err) {
    console.warn("Failed saving running goals to storage:", err);
  }
}

export function addTrainingBlock(
  title: string,
  targetWeeklyMileageKm: number,
  durationWeeks: number,
  focus: string,
  workouts?: TrainingWorkout[]
): TrainingBlock[] {
  const current = loadTrainingBlocks();
  const newBlock: TrainingBlock = {
    id: `block-${Date.now()}`,
    title: title.trim(),
    subtitle: `${targetWeeklyMileageKm} km/week · ${durationWeeks} Weeks`,
    targetWeeklyMileageKm,
    durationWeeks,
    currentWeek: 1,
    focus: focus.trim() || "Aerobic endurance and consistent running volume.",
    status: current.length === 0 ? "active" : "planned",
    createdAt: new Date().toISOString(),
    workouts: workouts && workouts.length > 0 ? workouts : createDefaultWeekWorkouts(targetWeeklyMileageKm),
  };

  const updated = [...current, newBlock];
  saveTrainingBlocks(updated);
  return updated;
}

export function setActiveTrainingBlock(id: string): TrainingBlock[] {
  const current = loadTrainingBlocks();
  const updated = current.map((b) => ({
    ...b,
    status: b.id === id ? ("active" as const) : b.status === "active" ? ("planned" as const) : b.status,
  }));
  saveTrainingBlocks(updated);
  return updated;
}

export function toggleWorkoutCompleted(blockId: string, workoutId: string): TrainingBlock[] {
  const current = loadTrainingBlocks();
  const updated = current.map((b) => {
    if (b.id !== blockId) return b;
    return {
      ...b,
      workouts: b.workouts.map((w) => (w.id === workoutId ? { ...w, completed: !w.completed } : w)),
    };
  });
  saveTrainingBlocks(updated);
  return updated;
}

export function deleteTrainingBlock(id: string): TrainingBlock[] {
  const current = loadTrainingBlocks();
  const updated = current.filter((b) => b.id !== id);
  saveTrainingBlocks(updated);
  return updated;
}

export function addRunningGoal(
  category: "mileage" | "pace" | "race" | "habit",
  title: string,
  targetValue: string,
  currentValue: string,
  deadline?: string
): RunningGoal[] {
  const current = loadRunningGoals();
  const newGoal: RunningGoal = {
    id: `goal-${Date.now()}`,
    category,
    title: title.trim(),
    targetValue: targetValue.trim(),
    currentValue: currentValue.trim(),
    progressPct: 0,
    deadline: deadline?.trim(),
    completed: false,
  };
  const updated = [...current, newGoal];
  saveRunningGoals(updated);
  return updated;
}

export function toggleGoalCompleted(id: string): RunningGoal[] {
  const current = loadRunningGoals();
  const updated = current.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g));
  saveRunningGoals(updated);
  return updated;
}

export function deleteRunningGoal(id: string): RunningGoal[] {
  const current = loadRunningGoals();
  const updated = current.filter((g) => g.id !== id);
  saveRunningGoals(updated);
  return updated;
}

function createDefaultWeekWorkouts(weeklyTarget: number): TrainingWorkout[] {
  const easyPct = Math.round(weeklyTarget * 0.18 * 10) / 10;
  const steadyPct = Math.round(weeklyTarget * 0.22 * 10) / 10;
  const longPct = Math.round(weeklyTarget * 0.35 * 10) / 10;
  const shakeoutPct = Math.round(weeklyTarget * 0.12 * 10) / 10;

  return [
    { id: `w-${Date.now()}-1`, day: "Mon", title: "Rest & Mobility", intensity: "rest", completed: false },
    { id: `w-${Date.now()}-2`, day: "Tue", title: "Zone 2 Base Run", distanceKm: easyPct, intensity: "zone2", completed: false },
    { id: `w-${Date.now()}-3`, day: "Wed", title: "Recovery Easy Run", distanceKm: shakeoutPct, intensity: "recovery", completed: false },
    { id: `w-${Date.now()}-4`, day: "Thu", title: "Aerobic Steady Run", distanceKm: steadyPct, intensity: "zone2", completed: false },
    { id: `w-${Date.now()}-5`, day: "Fri", title: "Rest / Cross-Train", intensity: "rest", completed: false },
    { id: `w-${Date.now()}-6`, day: "Sat", title: "Weekly Long Run", distanceKm: longPct, intensity: "zone2", completed: false },
    { id: `w-${Date.now()}-7`, day: "Sun", title: "Easy Shakeout Run", distanceKm: shakeoutPct, intensity: "recovery", completed: false },
  ];
}

/**
 * Intelligent "Suggest Better" Engine grounded in Lex Matondo's live Strava Telemetry,
 * atomic habits (systems over motivation), and endurance physiology.
 */
export function generateSuggestBetterInsights(
  stravaStats: StravaAthleteStats | null,
  activeBlock: TrainingBlock | undefined,
  goals: RunningGoal[]
): SuggestionInsight[] {
  const insights: SuggestionInsight[] = [];
  const weeklyKm = stravaStats ? stravaStats.weeklyMileageKm : 0;
  const weeklyTarget = activeBlock ? activeBlock.targetWeeklyMileageKm : 45;
  const diffKm = weeklyTarget - weeklyKm;

  // 1. Recovery & Heart Rate Analysis
  if (stravaStats?.latestRun) {
    const r = stravaStats.latestRun;
    const runDate = new Date(r.startDate);
    const hoursSince = (Date.now() - runDate.getTime()) / (1000 * 3600);

    if (r.averageHeartrate && r.averageHeartrate > 158) {
      insights.push({
        category: "intensity",
        headline: "Zone 3/4 Cardiovascular Drift Detected",
        detail: `Your latest run (${r.formattedDistance}) averaged ${r.averageHeartrate} bpm. Training above the aerobic threshold increases systemic sympathetic fatigue and prolongs recovery.`,
        action: "Enforce strict Zone 2 cap (< 148 bpm) for the next 48 hours to protect mitochondrial efficiency.",
        priority: "high",
      });
    } else if (hoursSince < 16 && r.distanceKm >= 12) {
      insights.push({
        category: "recovery",
        headline: "Acute Musculoskeletal Rebuild Window",
        detail: `Completed a substantial ${r.formattedDistance} session ${Math.round(hoursSince)} hours ago. Glycogen replenishment and connective tissue rehydration are primary.`,
        action: "Consume electrolytes, complete 10 mins of gentle calf/hamstring mobility, and delay next high-impact run.",
        priority: "high",
      });
    }
  }

  // 2. Volume Progression Analysis
  if (diffKm <= 0) {
    insights.push({
      category: "volume",
      headline: "Weekly Target Completed Ahead of Schedule",
      detail: `You have achieved ${weeklyKm.toFixed(1)} km out of your ${weeklyTarget} km target across ${stravaStats?.weeklyRunCount || 0} sessions. Avoid junk miles that spike overuse injury risks.`,
      action: "Maintain maintenance mode: optional light 3–4 km shakeout or full active recovery.",
      priority: "medium",
    });
  } else if (diffKm > 0 && diffKm <= 15) {
    insights.push({
      category: "volume",
      headline: `${diffKm.toFixed(1)} km Remaining to Close the Microcycle`,
      detail: `Current progress stands at ${Math.round((weeklyKm / weeklyTarget) * 100)}%. A single structured long run or two short aerobic flush sessions will seal the weekly objective.`,
      action: `Schedule a ${(diffKm * 0.7).toFixed(1)} km Saturday endurance session at conversational pace.`,
      priority: "high",
    });
  } else {
    insights.push({
      category: "volume",
      headline: `Pacing Microcycle: ${weeklyKm.toFixed(1)} / ${weeklyTarget} km Logged`,
      detail: `Ensure mileage is distributed evenly across 3 to 4 runs rather than cramming excessive volume into one day.`,
      action: "Divide remaining volume into 2x easy midweek runs + 1x weekend aerobic anchor.",
      priority: "medium",
    });
  }

  // 3. Atomic Habits & Environmental Design
  insights.push({
    category: "habits",
    headline: "Frictionless Running Routine (Atomic Habits)",
    detail: "Systems over motivation: Decisions consume cognitive bandwidth. Pre-staging your gear eliminates the activation energy barrier for early morning or post-lecture runs.",
    action: "Lay out running shoes, GPS watch, socks, and hydration bottle by your bedside tonight.",
    priority: "low",
  });

  // 4. Academic-Athletic Dual Balance (Cor Jesu BSCpE)
  insights.push({
    category: "tactical",
    headline: "Dual Pacing Protocol (BSCpE × Athletics)",
    detail: "Heavy engineering labs and coding sessions increase mental fatigue without physical load. Running serves as a cognitive reset, clearing brain fog.",
    action: "Pair a 45-minute easy run immediately following intense lab/embedded assignments to accelerate mental decompression.",
    priority: "medium",
  });

  // 5. Goal Alignment Analysis
  const pendingGoals = goals.filter((g) => !g.completed);
  if (pendingGoals.length > 0) {
    const primaryGoal = pendingGoals[0];
    insights.push({
      category: "tactical",
      headline: `Active Target Goal: ${primaryGoal.title}`,
      detail: `Target benchmark is ${primaryGoal.targetValue} (Current: ${primaryGoal.currentValue}). Progressive volume accumulation protects against sudden shin or Achilles strain.`,
      action: `Calibrate this week's long run and cadence toward ${primaryGoal.targetValue}.`,
      priority: "medium",
    });
  }

  return insights;
}
