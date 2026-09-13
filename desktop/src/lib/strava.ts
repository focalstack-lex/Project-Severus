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
    if (raw) return JSON.parse(raw);
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
  const cleanId = encodeURIComponent(clientId.trim());
  const cleanRedirect = encodeURIComponent(redirectUri);
  return `https://www.strava.com/oauth/authorize?client_id=${cleanId}&response_type=code&redirect_uri=${cleanRedirect}&approval_prompt=force&scope=read,activity:read_all`;
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
    const errText = await res.text();
    throw new Error(`Authorization code exchange failed (${res.status}): ${errText}`);
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
 * Internal: returns a valid unexpired Bearer token, automatically refreshing if needed.
 */
async function getValidAccessToken(config: StravaConfig): Promise<{ token: string; updatedConfig: StravaConfig }> {
  const nowSec = Math.floor(Date.now() / 1000);

  // If token has at least 2 minutes of validity, reuse it
  if (config.accessToken && config.expiresAt && config.expiresAt > nowSec + 120) {
    return { token: config.accessToken, updatedConfig: config };
  }

  // Otherwise, refresh it using refresh_token
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      grant_type: "refresh_token",
      refresh_token: config.refreshToken.trim(),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const updatedConfig: StravaConfig = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || config.refreshToken,
    expiresAt: data.expires_at,
  };

  saveStravaConfig(updatedConfig);
  return { token: data.access_token, updatedConfig };
}

/**
 * Format meters per second into "MM:SS /km" pace
 */
export function formatPace(metersPerSec: number): string {
  if (!metersPerSec || metersPerSec <= 0) return "--:-- /km";
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
 * Format ISO date string into relative/compact label
 */
export function formatRelativeDate(isoStr: string): string {
  const d = new Date(isoStr);
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
 * Transforms raw Strava API activity into clean, typed StravaActivity
 */
function transformActivity(raw: StravaRawActivity): StravaActivity {
  const distKm = raw.distance / 1000;
  const paceSec = distKm > 0 ? raw.moving_time / distKm : 0;

  return {
    id: raw.id,
    name: raw.name || "Untitled Run",
    type: raw.type,
    distanceKm: distKm,
    movingTimeSec: raw.moving_time,
    elevationGainM: Math.round(raw.total_elevation_gain || 0),
    startDate: raw.start_date_local || raw.start_date,
    averagePaceSec: paceSec,
    averageHeartrate: raw.average_heartrate ? Math.round(raw.average_heartrate) : undefined,
    maxHeartrate: raw.max_heartrate ? Math.round(raw.max_heartrate) : undefined,
    formattedDistance: `${distKm.toFixed(2)} km`,
    formattedPace: formatPace(raw.average_speed),
    formattedDuration: formatDuration(raw.moving_time),
    formattedDate: formatRelativeDate(raw.start_date_local || raw.start_date),
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
