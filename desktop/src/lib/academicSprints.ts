/**
 * Academic Engineering Sprints Engine for Severus
 *
 * Designed for Computer Engineering (BSCpE) student workflow:
 * Enforces the "1 Primary High-Leverage Sprint" rule (Atomic Habits)
 * along with secondary lab/exam milestones.
 */

export type SprintCategory = "lab" | "exam" | "project" | "study";

export interface AcademicSprintItem {
  id: string;
  title: string;
  category: SprintCategory;
  isPrimary: boolean;
  completed: boolean;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AcademicSprintsState {
  sprints: AcademicSprintItem[];
  weeklyGoal: string;
}

const STORAGE_KEY = "severus_academic_sprints";

const DEFAULT_STATE: AcademicSprintsState = {
  weeklyGoal: "BSCpE Embedded Firmware & Signal Processing",
  sprints: [
    {
      id: "sprint-default-1",
      title: "Microcontroller UART Driver & Timer Interrupts Lab",
      category: "lab",
      isPrimary: true,
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "sprint-default-2",
      title: "Review Digital Signal Processing Discrete Transforms",
      category: "study",
      isPrimary: false,
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

export function loadAcademicSprints(): AcademicSprintsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sprints)) {
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  return DEFAULT_STATE;
}

export function saveAcademicSprints(state: AcademicSprintsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("severus:academic-sprints-changed", { detail: state }));
  } catch (err) {
    console.error("Failed to save academic sprints:", err);
  }
}

export function addAcademicSprint(
  title: string,
  category: SprintCategory = "lab",
  isPrimary = false,
  dueDate?: string,
): AcademicSprintsState {
  const current = loadAcademicSprints();
  const trimmed = title.trim();
  if (!trimmed) return current;

  // If new item is primary, demote any existing primary
  const updatedList = current.sprints.map((s) => (isPrimary ? { ...s, isPrimary: false } : s));

  const newItem: AcademicSprintItem = {
    id: `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: trimmed,
    category,
    isPrimary,
    completed: false,
    dueDate,
    createdAt: new Date().toISOString(),
  };

  const nextState: AcademicSprintsState = {
    ...current,
    sprints: [newItem, ...updatedList],
  };

  saveAcademicSprints(nextState);
  return nextState;
}

export function toggleAcademicSprint(id: string): {
  state: AcademicSprintsState;
  completedItem?: AcademicSprintItem;
} {
  const current = loadAcademicSprints();
  let completedItem: AcademicSprintItem | undefined;

  const nextSprints = current.sprints.map((s) => {
    if (s.id === id) {
      const nextCompleted = !s.completed;
      const updated = {
        ...s,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : undefined,
      };
      if (nextCompleted) {
        completedItem = updated;
      }
      return updated;
    }
    return s;
  });

  const nextState: AcademicSprintsState = {
    ...current,
    sprints: nextSprints,
  };

  saveAcademicSprints(nextState);
  return { state: nextState, completedItem };
}

export function deleteAcademicSprint(id: string): AcademicSprintsState {
  const current = loadAcademicSprints();
  const nextState: AcademicSprintsState = {
    ...current,
    sprints: current.sprints.filter((s) => s.id !== id),
  };
  saveAcademicSprints(nextState);
  return nextState;
}

export function setPrimaryAcademicSprint(id: string): AcademicSprintsState {
  const current = loadAcademicSprints();
  const nextState: AcademicSprintsState = {
    ...current,
    sprints: current.sprints.map((s) => ({
      ...s,
      isPrimary: s.id === id,
    })),
  };
  saveAcademicSprints(nextState);
  return nextState;
}
