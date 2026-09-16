/**
 * Strava Running Telemetry Engine for Severus
 *
 * Integrates Strava API v3 OAuth 2.0 with automatic token refresh,
 * recent run ingestion, weekly/monthly mileage calculation,
 * and seamless audio/journal reporting.
 */

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  athleteId?: number;
  athleteName?: string;
  athleteAvatar?: string;
}

export interface StravaRawActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain: number; // in meters
  start_date_local: string; // ISO string
  start_date: string;
  average_speed: number; // m/s
  max_speed: number; // m/s
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  kudos_count?: number;
  pr_count?: number;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  distanceKm: number;
  movingTimeSec: number;
  elevationGainM: number;
  startDate: string;
  startTime?: string; // e.g. "6:16 PM"
  averagePaceSec: number; // sec / km
  averageHeartrate?: number;
  maxHeartrate?: number;
  formattedDistance: string; // e.g. "10.2 km"
  formattedPace: string; // e.g. "5:12 /km"
  formattedDuration: string; // e.g. "52m 14s" or "1h 12m"
  formattedDate: string; // e.g. "Today, 6:30 AM" or "Sep 12, 5:45 PM"
}

export interface StravaAthleteStats {
  athleteName: string;
  athleteAvatar?: string;
  recentRuns: StravaActivity[];
  latestRun?: StravaActivity;
  weeklyMileageKm: number;
  weeklyRunCount: number;
  monthlyMileageKm: number;
  lastSyncedAt: string;
}

const STORAGE_KEY = "severus_strava_config";
const CACHE_STATS_KEY = "severus_strava_cached_stats";

/**
 * Load Strava credentials from localStorage or fallback to .env
 */
export function loadStravaConfig(): StravaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          clientId: parsed.clientId || import.meta.env.VITE_STRAVA_CLIENT_ID || "",
          clientSecret: parsed.clientSecret || import.meta.env.VITE_STRAVA_CLIENT_SECRET || "",
          refreshToken: parsed.refreshToken || import.meta.env.VITE_STRAVA_REFRESH_TOKEN || "",
          accessToken: parsed.accessToken,
          expiresAt: parsed.expiresAt,
          athleteId: parsed.athleteId,
          athleteName: parsed.athleteName,
          athleteAvatar: parsed.athleteAvatar,
        };
      }
    }
  } catch {
    // Fallback to env
  }

  return {
    clientId: import.meta.env.VITE_STRAVA_CLIENT_ID || "",
    clientSecret: import.meta.env.VITE_STRAVA_CLIENT_SECRET || "",
    refreshToken: import.meta.env.VITE_STRAVA_REFRESH_TOKEN || "",
  };
}

export function saveStravaConfig(config: StravaConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("severus:strava-config-changed", { detail: config }));
  } catch (err) {
    console.error("Failed to save Strava config:", err);
  }
}

export function isStravaConfigured(config?: StravaConfig): boolean {
  const c = config || loadStravaConfig();
  return Boolean(c.clientId && c.clientSecret && c.refreshToken);
}

export function loadCachedStravaStats(): StravaAthleteStats | null {
  try {
    const raw = localStorage.getItem(CACHE_STATS_KEY);
    if (raw) {
      const stats = JSON.parse(raw) as StravaAthleteStats;
      if (stats && Array.isArray(stats.recentRuns)) {
        stats.recentRuns = stats.recentRuns.map((r) => {
          const cleanDate = (r.startDate || "").replace(/Z$/, "");
          const d = parseStravaDate(cleanDate);
          return {
            ...r,
            startDate: cleanDate,
            formattedDate: formatRelativeDate(cleanDate),
            startTime: !isNaN(d.getTime())
              ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
              : undefined,
          };
        });
        if (stats.latestRun) {
          const cleanDate = (stats.latestRun.startDate || "").replace(/Z$/, "");
          const d = parseStravaDate(cleanDate);
          stats.latestRun = {
            ...stats.latestRun,
            startDate: cleanDate,
            formattedDate: formatRelativeDate(cleanDate),
            startTime: !isNaN(d.getTime())
              ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
              : undefined,
          };
        }
      }
      return stats;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function saveCachedStravaStats(stats: StravaAthleteStats): void {
  try {
    localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent("severus:strava-stats-updated", { detail: stats }));
  } catch (err) {
    console.error("Failed to cache Strava stats:", err);
  }
}

/**
 * Generates the 1-click Authorization URL for getting an authorization code
 * with the required `activity:read_all` scope.
 */
export function buildStravaAuthUrl(clientId: string, redirectUri = "http://localhost"): string {
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read,activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an Authorization Code (from the OAuth redirect) for permanent refresh & access tokens.
 */
export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<StravaConfig> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      code: code.trim(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const athlete = data.athlete;

  const newConfig: StravaConfig = {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: data.expires_at,
    athleteId: athlete?.id,
    athleteName: athlete ? `${athlete.firstname || ""} ${athlete.lastname || ""}`.trim() : undefined,
    athleteAvatar: athlete?.profile_medium || athlete?.profile,
  };

  saveStravaConfig(newConfig);
  return newConfig;
}

/**
 * Returns a valid access token, refreshing it automatically if expired
 */
async function getValidAccessToken(config: StravaConfig): Promise<{ token: string; updatedConfig: StravaConfig }> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (config.accessToken && config.expiresAt && config.expiresAt > nowSec + 60) {
    return { token: config.accessToken, updatedConfig: config };
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Strava token (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const updated: StravaConfig = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  saveStravaConfig(updated);
  return { token: data.access_token, updatedConfig: updated };
}

/**
 * Format meters/sec speed into human-friendly min/km pace
 */
export function formatPace(metersPerSec: number): string {
  if (!metersPerSec || metersPerSec <= 0) return "—";
  const secPerKm = 1000 / metersPerSec;
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.floor(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

/**
 * Format duration in seconds into human-readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

/**
 * Safely parse an activity date string from Strava.
 * Strava's `start_date_local` provides the athlete's exact local wall-clock time
 * (e.g. "2026-09-14T05:36:00Z" for 5:36 AM local).
 * Crucially, Strava appends a trailing 'Z' to start_date_local. If passed directly
 * to new Date(), the browser interprets 'Z' as UTC and adds the local timezone
 * offset (+8h in Asia/Manila), erroneously shifting 5:36 AM to 1:36 PM!
 * Stripping the trailing 'Z' ensures JavaScript parses it directly in local time.
 */
export function parseStravaDate(isoStr: string): Date {
  if (!isoStr) return new Date();
  const cleanStr = isoStr.replace(/Z$/, "");
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) return d;
  return new Date(isoStr);
}

/**
 * Format ISO date string into relative/compact label with exact activity time
 */
export function formatRelativeDate(isoStr: string): string {
  if (!isoStr) return "Recent";
  const d = parseStravaDate(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday, ${timeStr}`;

  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
}

/**
 * Transforms raw Strava API activity into clean, typed StravaActivity.
 * Uses raw.start_date_local stripped of trailing 'Z' as the canonical local timestamp!
 */
function transformActivity(raw: StravaRawActivity): StravaActivity {
  const distKm = raw.distance / 1000;
  const paceSec = distKm > 0 ? raw.moving_time / distKm : 0;

  // Use raw.start_date_local without trailing 'Z' so it is parsed in local time!
  const localIso = raw.start_date_local
    ? raw.start_date_local.replace(/Z$/, "")
    : (raw.start_date ? raw.start_date.replace(/Z$/, "") : new Date().toISOString().replace(/Z$/, ""));

  const d = parseStravaDate(localIso);
  const startTime = !isNaN(d.getTime())
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;

  return {
    id: raw.id,
    name: raw.name || "Untitled Run",
    type: raw.type,
    distanceKm: distKm,
    movingTimeSec: raw.moving_time,
    elevationGainM: Math.round(raw.total_elevation_gain || 0),
    startDate: localIso,
    startTime,
    averagePaceSec: paceSec,
    averageHeartrate: raw.average_heartrate ? Math.round(raw.average_heartrate) : undefined,
    maxHeartrate: raw.max_heartrate ? Math.round(raw.max_heartrate) : undefined,
    formattedDistance: `${distKm.toFixed(2)} km`,
    formattedPace: formatPace(raw.average_speed),
    formattedDuration: formatDuration(raw.moving_time),
    formattedDate: formatRelativeDate(localIso),
  };
}

/**
 * Fetch latest athletic activities and compute weekly/monthly mileage
 */
export async function fetchStravaAthleteStats(cfg?: StravaConfig): Promise<StravaAthleteStats> {
  const config = cfg || loadStravaConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error("Strava API is not configured. Please provide Client ID, Secret, and Refresh Token.");
  }

  const { token, updatedConfig } = await getValidAccessToken(config);

  // 1. Fetch Athlete profile if not stored
  let athleteName = updatedConfig.athleteName;
  let athleteAvatar = updatedConfig.athleteAvatar;

  if (!athleteName) {
    try {
      const athleteRes = await fetch("https://www.strava.com/api/v3/athlete", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (athleteRes.ok) {
        const a = await athleteRes.json();
        athleteName = `${a.firstname || ""} ${a.lastname || ""}`.trim();
        athleteAvatar = a.profile_medium || a.profile;
        saveStravaConfig({
          ...updatedConfig,
          athleteId: a.id,
          athleteName,
          athleteAvatar,
        });
      }
    } catch {
      // Continue even if profile fetch fails
    }
  }

  // 2. Fetch Recent Activities (up to 30)
  const activitiesRes = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=30",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!activitiesRes.ok) {
    const errText = await activitiesRes.text();
    throw new Error(`Failed to fetch activities (${activitiesRes.status}): ${errText}`);
  }

  const rawActivities: StravaRawActivity[] = await activitiesRes.json();

  // Filter for Running activities only
  const runs = rawActivities
    .filter((a) => a.type === "Run" || a.sport_type === "Run" || a.sport_type === "TrailRun")
    .map(transformActivity);

  // 3. Compute Weekly Mileage (Monday 00:00:00 to now)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
  const mondayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);

  // First day of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  let weeklyKm = 0;
  let weeklyRuns = 0;
  let monthlyKm = 0;

  for (const r of runs) {
    const actDate = new Date(r.startDate);
    if (actDate >= mondayMidnight) {
      weeklyKm += r.distanceKm;
      weeklyRuns += 1;
    }
    if (actDate >= monthStart) {
      monthlyKm += r.distanceKm;
    }
  }

  const stats: StravaAthleteStats = {
    athleteName: athleteName || "Lex Matondo",
    athleteAvatar,
    recentRuns: runs,
    latestRun: runs[0],
    weeklyMileageKm: Math.round(weeklyKm * 100) / 100,
    weeklyRunCount: weeklyRuns,
    monthlyMileageKm: Math.round(monthlyKm * 100) / 100,
    lastSyncedAt: new Date().toISOString(),
  };

  saveCachedStravaStats(stats);
  return stats;
}

/**
 * Generates an authoritative, respectful Severus spoken report for voice briefing
 */
export function formatStravaVoiceReport(stats: StravaAthleteStats): string {
  if (!stats.latestRun) {
    return `You have no recent Strava runs recorded this week, Sir. Your weekly mileage sits at ${stats.weeklyMileageKm.toFixed(1)} kilometers, Sir.`;
  }

  const latest = stats.latestRun;
  return `Strava telemetry is synchronized, Sir. You have logged ${stats.weeklyMileageKm.toFixed(1)} kilometers across ${stats.weeklyRunCount} runs this week. Your last session was ${latest.formattedDistance} at an average pace of ${latest.formattedPace}, Sir.`;
}
