import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openExternalUrl } from "./tauri";

/**
 * Gmail school-mail updates — renderer client following the Strava pattern:
 * all HTTPS goes through renderer fetch, config lives in localStorage, and the
 * refresh token + client secret live in Windows Credential Manager (via the
 * Rust `secure_*` commands). Read-only scope; headers only, never bodies.
 */

export interface GmailConfig {
  clientId: string;
  domain: string; // school domain, e.g. "davao.cjc.edu.ph" (no @)
  pollMinutes: number;
  port: number; // loopback redirect port — keep stable per Google client
  connected: boolean;
  lastSyncAt: number | null;
}

export interface EmailUpdate {
  id: string;
  from: string;
  subject: string;
  date: string;
}

export interface MailPollResult {
  isNew: boolean; // false during the silent baseline sync
  count: number; // total unread matching the filter
  emails: EmailUpdate[]; // new arrivals (all emails on baseline)
}

const CONFIG_KEY = "severus_gmail_config";
const ACCESS_KEY = "severus_gmail_access";
const SEEN_KEY = "severus_gmail_seen_ids";
const GRANTED_SCOPE_KEY = "severus_gmail_granted_scope";
export const GMAIL_MAIL_EVENT = "severus:mail-updated";
const DEFAULT_PORT = 47153;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const DEFAULT_GMAIL_CONFIG: GmailConfig = {
  clientId: "",
  domain: "",
  pollMinutes: 3,
  port: DEFAULT_PORT,
  connected: false,
  lastSyncAt: null,
};

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

let accessCache: AccessTokenCache | null = null;
let pollTimer: number | null = null;
let pollBusy = false;
let lastMailSnapshot: MailPollResult | null = null;
let lastMailSnapshotAt: number | null = null;

/** Latest poll result (kept fresh by the background poller) for consumers
 * like Thinking Mode that need mail context without refetching. */
export function getLastMailSnapshot(): MailPollResult | null {
  return lastMailSnapshot;
}

export function getLastMailSnapshotAt(): number | null {
  return lastMailSnapshotAt;
}

// --- config ---

/** Normalize the school domain: trim, lowercase, strip leading @ so the
 * Gmail query never doubles it ("@@domain"). */
function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function loadGmailConfig(): GmailConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<GmailConfig>) : {};
    const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    return {
      clientId: parsed.clientId ?? env.VITE_GMAIL_CLIENT_ID ?? DEFAULT_GMAIL_CONFIG.clientId,
      domain: normalizeDomain(parsed.domain ?? env.VITE_GMAIL_DOMAIN ?? DEFAULT_GMAIL_CONFIG.domain),
      pollMinutes: parsed.pollMinutes ?? DEFAULT_GMAIL_CONFIG.pollMinutes,
      port: parsed.port ?? DEFAULT_GMAIL_CONFIG.port,
      connected: parsed.connected ?? false,
      lastSyncAt: parsed.lastSyncAt ?? null,
    };
  } catch {
    return { ...DEFAULT_GMAIL_CONFIG };
  }
}

export function saveGmailConfig(config: GmailConfig): void {
  try {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ ...config, domain: normalizeDomain(config.domain) }),
    );
  } catch (err) {
    console.error("Failed to save Gmail config:", err);
  }
}

export function isGmailConnected(config: GmailConfig): boolean {
  return config.connected && config.clientId.trim().length > 0 && config.domain.trim().length > 0;
}

// --- auth ---

async function secureStore(key: string, value: string): Promise<void> {
  await invoke("secure_store", { key, value });
}

async function secureLoad(key: string): Promise<string> {
  return invoke<string>("secure_load", { key });
}

async function secureDelete(key: string): Promise<void> {
  try {
    await invoke("secure_delete", { key });
  } catch {
    // deleting an absent credential is fine
  }
}

/** Opens the browser consent page and resolves with the authorization code
 * captured by the Rust loopback listener. Rejects on denial/timeout. */
export async function beginGmailConsent(clientId: string): Promise<string> {
  const state = `sev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const authUrl = await invoke<string>("gmail_begin_auth", {
    clientId: clientId.trim(),
    port: loadGmailConfig().port,
    state,
  });
  openExternalUrl(authUrl);

  return new Promise<string>((resolve, reject) => {
    const unlistenFns: Array<() => void> = [];
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("no authorization code arrived within 5 minutes"));
    }, 5 * 60 * 1000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("severus-mock-gmail-code", mockHandler);
      unlistenFns.forEach((fn) => fn());
    };
    // Dev-harness bridge: the mock backend signals a captured code via DOM
    // event (no real Tauri event loop exists in a plain browser).
    const mockHandler = (event: Event) => {
      cleanup();
      resolve((event as CustomEvent<string>).detail);
    };
    window.addEventListener("severus-mock-gmail-code", mockHandler);

    void listen<string>("gmail-auth-code", (event) => {
      cleanup();
      resolve(event.payload);
    }).then((fn) => unlistenFns.push(fn));

    void listen<string>("gmail-auth-failed", (event) => {
      cleanup();
      reject(new Error(event.payload));
    }).then((fn) => unlistenFns.push(fn));
  });
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 160);
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string };
      detail = parsed.error_description ?? parsed.error ?? detail;
    } catch {
      // keep raw text
    }
    throw new Error(`Token request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}

function cacheAccess(tokenResponse: TokenResponse): void {
  accessCache = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in - 60) * 1000,
  };
  if (tokenResponse.scope) {
    try {
      localStorage.setItem(GRANTED_SCOPE_KEY, tokenResponse.scope);
    } catch {
      // best effort
    }
  }
  try {
    localStorage.setItem(
      ACCESS_KEY,
      JSON.stringify({ token: accessCache.token, expiresAt: accessCache.expiresAt }),
    );
  } catch {
    // cache loss is harmless — we just refresh
  }
}

function cachedAccessToken(): string | null {
  if (accessCache && Date.now() < accessCache.expiresAt) return accessCache.token;
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessTokenCache;
    if (Date.now() < parsed.expiresAt) {
      accessCache = parsed;
      return parsed.token;
    }
  } catch {
    // fall through to refresh
  }
  return null;
}

/** Called once after the user consents: exchanges the code, stores the
 * refresh token in the Credential Manager, marks the config connected. */
export async function completeGmailConnect(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<GmailConfig> {
  const config = loadGmailConfig();
  const token = await tokenRequest({
    code,
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
    redirect_uri: `http://127.0.0.1:${config.port}`,
    grant_type: "authorization_code",
  });
  if (!token.refresh_token) {
    throw new Error(
      "Google did not return a refresh token — revoke Severus at myaccount.google.com/permissions and connect again.",
    );
  }
  if (token.scope && !token.scope.includes("gmail.readonly")) {
    throw new Error(`Unexpected scope granted: ${token.scope}`);
  }
  // Record exactly what Google granted — a token without the Classroom scopes
  // means the running Rust binary is older than the scope change.
  try {
    localStorage.setItem(GRANTED_SCOPE_KEY, token.scope ?? "");
  } catch {
    // best effort
  }
  // The coursework scope is what actually gates courseWork/studentSubmissions
  // reads. Its absence means the running binary predates the scope fix, the
  // consent came from a stale tab, or Google dropped the scope (admin policy).
  if (token.scope && !token.scope.includes("classroom.coursework.me.readonly")) {
    const granted = token.scope
      .split(" ")
      .map((scope) => scope.replace("https://www.googleapis.com/auth/", ""))
      .join(", ");
    throw new Error(
      `Google did not grant the Classroom Coursework scope (granted: ${granted || "none"}). ` +
        "Close any old consent tabs, restart the app you are using (dev: stop and rerun `npm run tauri dev`; installed: rebuild and reinstall), then connect again and confirm the Classroom coursework permission is listed before you click Allow.",
    );
  }
  await secureStore("gmail_refresh_token", token.refresh_token);
  await secureStore("gmail_client_secret", clientSecret.trim());
  cacheAccess(token);

  const next: GmailConfig = { ...config, clientId: clientId.trim(), connected: true };
  saveGmailConfig(next);
  return next;
}

async function getAccessToken(): Promise<string> {
  const cached = cachedAccessToken();
  if (cached) return cached;
  const refreshToken = await secureLoad("gmail_refresh_token");
  const clientSecret = await secureLoad("gmail_client_secret");
  const config = loadGmailConfig();
  const token = await tokenRequest({
    refresh_token: refreshToken,
    client_id: config.clientId.trim(),
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  cacheAccess(token);
  return token.access_token;
}

// --- polling ---

interface MessageListItem {
  id: string;
}

interface MessageMetadata {
  id: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

function headerValue(message: MessageMetadata, name: string): string {
  const header = message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function seenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function storeSeenIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    // best effort
  }
}

/** Fetch unread mail from the configured school domain (headers only). */
export async function fetchUnreadSchoolMail(): Promise<EmailUpdate[]> {
  const config = loadGmailConfig();
  const domain = normalizeDomain(config.domain);
  if (!domain) {
    throw new Error("School domain is not configured.");
  }
  const token = await getAccessToken();
  const query = encodeURIComponent(`from:(@${domain}) is:unread`);
  const listRes = await fetch(
    `${API_BASE}/messages?q=${query}&maxResults=15`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res401(listRes)) {
    const refreshed = await getAccessToken(); // cached token expired mid-flight
    const retry = await fetch(
      `${API_BASE}/messages?q=${query}&maxResults=15`,
      { headers: { Authorization: `Bearer ${refreshed}` } },
    );
    if (!retry.ok) throw new Error(await gmailApiError(retry));
    return readMessageList(await retry.json());
  }
  if (!listRes.ok) throw new Error(await gmailApiError(listRes));
  return readMessageList(await listRes.json());
}

function res401(res: Response): boolean {
  return res.status === 401;
}

async function gmailApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let detail = text.slice(0, 160);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    detail = parsed.error?.message ?? detail;
  } catch {
    // keep raw text
  }
  return `Gmail API error (${res.status}): ${detail}`;
}

async function readMessageList(list: { messages?: MessageListItem[] }): Promise<EmailUpdate[]> {
  const messages = list.messages ?? [];
  const token = await getAccessToken();
  const updates = await Promise.all(
    messages.map(async (item) => {
      const res = await fetch(
        `${API_BASE}/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      const meta = (await res.json()) as MessageMetadata;
      return {
        id: meta.id,
        from: headerValue(meta, "From"),
        subject: headerValue(meta, "Subject"),
        date: headerValue(meta, "Date"),
      } satisfies EmailUpdate;
    }),
  );
  return updates.filter((update): update is EmailUpdate => update !== null);
}

/** One poll cycle. First run establishes the silent baseline; afterwards,
 * unseen messages fire the `severus:mail-updated` event. */
export async function pollSchoolMail(): Promise<MailPollResult> {
  const emails = await fetchUnreadSchoolMail();
  const seen = seenIds();
  const arrivals = emails.filter((email) => !seen.has(email.id));

  const next = new Set(seen);
  for (const email of emails) next.add(email.id);
  storeSeenIds(next);

  const config = loadGmailConfig();
  saveGmailConfig({ ...config, lastSyncAt: Date.now() });

  const firstBaseline = seen.size === 0 && emails.length > 0;
  const result: MailPollResult = {
    isNew: !firstBaseline && arrivals.length > 0,
    count: emails.length,
    emails: firstBaseline ? emails : arrivals,
  };
  lastMailSnapshot = result;
  lastMailSnapshotAt = Date.now();

  if (result.isNew) {
    window.dispatchEvent(new CustomEvent(GMAIL_MAIL_EVENT, { detail: result }));
  }
  return result;
}

/** Poll immediately; errors surface to the caller instead of the event. */
export async function checkMailNow(): Promise<MailPollResult> {
  return pollSchoolMail();
}

// ---------------------------------------------------------------------------
// Google Classroom — courses, coursework deadlines, submission state,
// announcements. Read-only; a student account sees its own submissions.
// ---------------------------------------------------------------------------

export interface ClassroomDue {
  courseWorkId: string;
  courseId: string;
  course: string;
  title: string;
  due: string; // human-readable, e.g. "Fri, Sep 19 23:59"
  state: string; // NEW | CREATED | TURNED_IN | RETURNED | MISSING
}

export interface ClassroomAnnouncement {
  courseId: string;
  course: string;
  text: string;
  postedAt: string;
}

export interface ClassroomSnapshot {
  courses: string[];
  dueSoon: ClassroomDue[];
  missing: ClassroomDue[];
  announcements: ClassroomAnnouncement[];
  error: string | null; // e.g. "reconnect required" when scopes are stale
}

export const GMAIL_CLASSROOM_EVENT = "severus:classroom-updated";
const CLASSROOM_CACHE_KEY = "severus_classroom_cache";

let classroomTimer: number | null = null;
let classroomBusy = false;
let lastClassroomSnapshot: ClassroomSnapshot | null = null;
let lastClassroomAt: number | null = null;

export function getLastClassroomSnapshot(): ClassroomSnapshot | null {
  return lastClassroomSnapshot;
}

export function getLastClassroomAt(): number | null {
  return lastClassroomAt;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDueDate(due: {
  year?: number;
  month?: number;
  day?: number;
  dueTime?: { hours?: number; minutes?: number };
}): string {
  if (!due.year || !due.month || !due.day) return "no due date";
  const hours = due.dueTime?.hours ?? 23;
  const minutes = due.dueTime?.minutes ?? 59;
  const date = new Date(due.year, due.month - 1, due.day, hours, minutes);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function classroomAuthedFetch(path: string): Promise<unknown> {
  return getAccessToken().then((token) =>
    fetch(`https://classroom.googleapis.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (res.status === 401) {
        const fresh = await getAccessToken();
        const retry = await fetch(`https://classroom.googleapis.com/v1${path}`, {
          headers: { Authorization: `Bearer ${fresh}` },
        });
        if (!retry.ok) throw new Error(await classroomApiError(retry));
        return retry.json();
      }
      if (!res.ok) throw new Error(await classroomApiError(res));
      return res.json();
    }),
  );
}

async function classroomApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let detail = text.slice(0, 400);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    detail = parsed.error?.message ?? detail;
  } catch {
    // keep raw text
  }
  if (res.status === 403) {
    const granted = localStorage.getItem(GRANTED_SCOPE_KEY) ?? "";
    if (!granted.includes("classroom.coursework.me.readonly")) {
      return `Classroom assignments are blocked: the current token predates the Coursework scope (${res.status}) — fully restart the app so Rust rebuilds, then Disconnect & Reconnect in Settings.`;
    }
    // The classic first-run case: the Classroom API is not enabled on the
    // user's Cloud project. Google's detail already contains the enable URL.
    if (/classroom api (has not been used|is disabled)/i.test(detail)) {
      const url = detail.match(/https:\/\/console\.[^\s]+/i)?.[0];
      return `The Google Classroom API is not enabled in your Cloud project yet. Enable it in Cloud Console${url ? `: ${url}` : " (APIs & Services → Library → Google Classroom API → Enable)"} — it takes a minute, then poll again.`;
    }
    return `Classroom API refused the request (${res.status}): ${detail}`;
  }
  return `Classroom API error (${res.status}): ${detail}`;
}

/** Build the full classroom picture: courses, due-soon, missing, announcements. */
export async function fetchClassroomSnapshot(): Promise<ClassroomSnapshot> {
  const coursesRes = (await classroomAuthedFetch("/courses?courseStates=ACTIVE&pageSize=20")) as {
    courses?: Array<{ id: string; name: string }>;
  };
  const courses = coursesRes.courses ?? [];
  const snapshot: ClassroomSnapshot = {
    courses: courses.map((c) => c.name),
    dueSoon: [],
    missing: [],
    announcements: [],
    error: null,
  };

  const consideredCourses = courses.slice(0, 10);
  let failedCourses = 0;
  let firstCourseError: string | null = null;
  await Promise.all(
    consideredCourses.map(async (course) => {
      try {
        const work = (await classroomAuthedFetch(
          `/courses/${course.id}/courseWork?courseWorkStates=PUBLISHED&pageSize=30`,
        )) as {
          courseWork?: Array<{
            id: string;
            title?: string;
            dueDate?: { year?: number; month?: number; day?: number };
            dueTime?: { hours?: number; minutes?: number };
          }>;
        };
        const submissions = (await classroomAuthedFetch(
          `/courses/${course.id}/studentSubmissions?userId=me&pageSize=30`,
        )) as {
          studentSubmissions?: Array<{
            courseWorkId: string;
            state: string;
          }>;
        };
        const workById = new Map((work.courseWork ?? []).map((w) => [w.id, w]));
        for (const submission of submissions.studentSubmissions ?? []) {
          const item = workById.get(submission.courseWorkId);
          if (!item) continue;
          const entry: ClassroomDue = {
            courseWorkId: item.id,
            courseId: course.id,
            course: course.name,
            title: item.title ?? "(untitled)",
            due: formatDueDate(item),
            state: submission.state,
          };
          if (entry.state === "MISSING") {
            snapshot.missing.push(entry);
          } else if (entry.state === "NEW" || entry.state === "CREATED") {
            snapshot.dueSoon.push(entry);
          }
        }
        const announcementsRes = (await classroomAuthedFetch(
          `/courses/${course.id}/announcements?pageSize=3`,
        )) as {
          announcements?: Array<{ id: string; text?: string; creationTime?: string }>;
        };
        for (const announcement of announcementsRes.announcements ?? []) {
          const text = stripHtml(announcement.text ?? "");
          if (text) {
            snapshot.announcements.push({
              courseId: course.id,
              course: course.name,
              text: text.slice(0, 200),
              postedAt: announcement.creationTime ?? "",
            });
          }
        }
      } catch (err) {
        failedCourses += 1;
        firstCourseError ??= String(err instanceof Error ? err.message : err);
        // One course failing must not kill the whole snapshot
        console.warn(`[classroom] course "${course.name}" failed:`, String(err));
      }
    }),
  );

  // If every course failed it is a systemic problem (stale scopes, API
  // disabled, quota) — surface it instead of rendering a silently empty Hub.
  if (consideredCourses.length > 0 && failedCourses === consideredCourses.length) {
    snapshot.error = firstCourseError;
  }

  const byDue = (a: ClassroomDue, b: ClassroomDue) => a.due.localeCompare(b.due);
  snapshot.dueSoon.sort(byDue);
  snapshot.missing.sort(byDue);
  snapshot.announcements = snapshot.announcements.slice(0, 6);
  return snapshot;
}

/** One classroom poll cycle: fetch, cache, announce via event. */
export async function pollClassroom(): Promise<ClassroomSnapshot> {
  try {
    const snapshot = await fetchClassroomSnapshot();
    lastClassroomSnapshot = snapshot;
    lastClassroomAt = Date.now();
    try {
      localStorage.setItem(CLASSROOM_CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // best effort
    }
    window.dispatchEvent(new CustomEvent(GMAIL_CLASSROOM_EVENT, { detail: snapshot }));
    return snapshot;
  } catch (err) {
    // surface the failure in the cached snapshot so the Hub can explain it
    const message = String(err instanceof Error ? err.message : err);
    const snapshot: ClassroomSnapshot = {
      courses: [],
      dueSoon: [],
      missing: [],
      announcements: [],
      error: message,
    };
    lastClassroomSnapshot = snapshot;
    lastClassroomAt = Date.now();
    window.dispatchEvent(new CustomEvent(GMAIL_CLASSROOM_EVENT, { detail: snapshot }));
    throw err;
  }
}

function loadClassroomCache(): ClassroomSnapshot | null {
  try {
    const raw = localStorage.getItem(CLASSROOM_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ClassroomSnapshot) : null;
  } catch {
    return null;
  }
}

export function startClassroomPolling(): void {
  const config = loadGmailConfig();
  if (!isGmailConnected(config)) return;
  stopClassroomPolling();
  // Seed the Hub from cache so it renders instantly.
  const cached = loadClassroomCache();
  if (cached) {
    lastClassroomSnapshot = cached;
    window.dispatchEvent(new CustomEvent(GMAIL_CLASSROOM_EVENT, { detail: cached }));
  }
  // First sync immediately — never make the user wait for the first interval.
  if (!classroomBusy) {
    classroomBusy = true;
    pollClassroom()
      .catch((err) => console.warn("[classroom] initial sync failed:", String(err)))
      .finally(() => {
        classroomBusy = false;
      });
  }
  const interval = Math.max(6, config.pollMinutes * 2) * 60 * 1000;
  classroomTimer = window.setInterval(() => {
    if (document.hidden || classroomBusy) return;
    classroomBusy = true;
    pollClassroom()
      .catch((err) => console.warn("[classroom] poll failed:", String(err)))
      .finally(() => {
        classroomBusy = false;
      });
  }, interval);
}

export function stopClassroomPolling(): void {
  if (classroomTimer !== null) {
    window.clearInterval(classroomTimer);
    classroomTimer = null;
  }
}

/** Spoken summary for "what's due" — deadlines first, then missing, then news. */
export function formatClassroomSummary(snapshot: ClassroomSnapshot): string {
  if (snapshot.error) {
    return `I could not reach Google Classroom, Sir. ${snapshot.error}`;
  }
  const parts: string[] = [];
  const dueSoon = snapshot.dueSoon.slice(0, 2);
  if (snapshot.dueSoon.length > 0) {
    const items = dueSoon
      .map((item) => `${item.course} — ${item.title}, due ${item.due}`)
      .join(". And ");
    parts.push(
      `${capitalize(countToWord(snapshot.dueSoon.length))} assignment${snapshot.dueSoon.length === 1 ? "" : "s"} due: ${items}.`,
    );
  }
  if (snapshot.missing.length > 0) {
    parts.push(
      `${capitalize(countToWord(snapshot.missing.length))} missing: ${snapshot.missing
        .slice(0, 2)
        .map((item) => `${item.course} — ${item.title}`)
        .join(". And ")}.`,
    );
  }
  if (snapshot.announcements.length > 0 && parts.length < 2) {
    parts.push(
      `Latest announcement in ${snapshot.announcements[0].course}: ${snapshot.announcements[0].text.slice(0, 90)}.`,
    );
  }
  if (parts.length === 0) {
    return "Classroom is clear, Sir — nothing due, nothing missing.";
  }
  return parts.join(" ");
}

export function startGmailPolling(): void {
  const config = loadGmailConfig();
  if (!isGmailConnected(config)) return;
  stopGmailPolling();
  // First mail sync immediately (silent baseline on a fresh seen-list).
  if (!pollBusy) {
    pollBusy = true;
    pollSchoolMail()
      .catch((err) => console.warn("[gmail] initial sync failed:", String(err)))
      .finally(() => {
        pollBusy = false;
      });
  }
  const interval = Math.max(1, config.pollMinutes) * 60 * 1000;
  pollTimer = window.setInterval(() => {
    if (document.hidden || pollBusy) return;
    pollBusy = true;
    pollSchoolMail()
      .catch((err) => console.warn("[gmail] poll failed:", String(err)))
      .finally(() => {
        pollBusy = false;
      });
  }, interval);
  startClassroomPolling();
}

export function stopGmailPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  stopClassroomPolling();
}

export function isGmailPollingActive(): boolean {
  return pollTimer !== null;
}

/** Revoke at Google and wipe every stored credential + baseline. */
export async function disconnectGmail(): Promise<void> {
  stopGmailPolling();
  try {
    const refreshToken = await secureLoad("gmail_refresh_token");
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
  } catch {
    // token already dead — keep wiping locally regardless
  }
  await secureDelete("gmail_refresh_token");
  await secureDelete("gmail_client_secret");
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(SEEN_KEY);
  accessCache = null;
  const config = loadGmailConfig();
  saveGmailConfig({ ...config, connected: false, lastSyncAt: null });
}

// --- presentation helpers ---

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function countToWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export function formatMailSummary(result: MailPollResult): string {
  if (result.count === 0) {
    return "No unread school emails, Sir.";
  }
  const countWord = NUMBER_WORDS[result.count] ?? String(result.count);
  if (result.emails.length === 0) {
    return `${capitalize(countWord)} unread school email${result.count === 1 ? "" : "s"}, Sir.`;
  }
  const latest = result.emails[0];
  const sender = shorten(senderName(latest.from), 40);
  const subject = shorten(latest.subject || "(no subject)", 60);
  const countPart =
    result.emails.length === 1
      ? "One new school email"
      : `${capitalize(countWord)} new school emails`;
  return `${countPart}, Sir. Latest from ${sender} about ${subject}.`;
}

function senderName(from: string): string {
  // "Registrar <registrar@school.edu>" → "Registrar"; bare address → local part
  const angled = from.match(/^(.*?)\s*<[^>]+>$/);
  if (angled && angled[1].trim()) return angled[1].trim();
  return from.split("@")[0] ?? from;
}

function shorten(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
