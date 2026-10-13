export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const TOKEN_KEY = "ilc_token";
const EXPIRED_KEY = "jdc_session_expired";

/** Fired when the server rejects our token, so the app can sign out everywhere at once. */
export const SESSION_EXPIRED_EVENT = "jdc:session-expired";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** True once after the session ended because the token expired (the login page explains why). */
export function takeSessionExpired(): boolean {
  try {
    const expired = sessionStorage.getItem(EXPIRED_KEY) === "1";
    sessionStorage.removeItem(EXPIRED_KEY);
    return expired;
  } catch {
    return false;
  }
}

function endExpiredSession(): void {
  setToken(null);
  try {
    sessionStorage.setItem(EXPIRED_KEY, "1");
  } catch {
    // storage unavailable: the user just lands on the login page without the note
  }
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

/** FastAPI errors: a string, or (422) a list of field problems. Make either readable. */
function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return (detail as ValidationIssue[])
      .map((issue) => {
        const field = issue.loc?.[issue.loc.length - 1];
        const msg = (issue.msg ?? "is invalid").replace(/^Value error, /, "");
        return typeof field === "string" && field !== "body" ? `${field.replaceAll("_", " ")}: ${msg}` : msg;
      })
      .join("; ");
  }
  return JSON.stringify(detail);
}

async function send(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = describeDetail(body.detail);
    } catch {
      // response had no JSON body — fall back to statusText
    }
    // A signed-in request was rejected: the token expired or was revoked (e.g. the
    // password was changed elsewhere). End the session instead of leaving pages broken.
    if (response.status === 401 && token) endExpiredSession();
    throw new ApiError(response.status, detail);
  }
  return response;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withBody(method: string, body?: unknown): RequestInit {
  return { method, body: body !== undefined ? JSON.stringify(body) : undefined };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, withBody("POST", body)),
  put: <T>(path: string, body?: unknown) => request<T>(path, withBody("PUT", body)),
  patch: <T>(path: string, body?: unknown) => request<T>(path, withBody("PATCH", body)),
  delete: <T>(path: string, body?: unknown) => request<T>(path, withBody("DELETE", body)),
};

/** Fetch an authenticated endpoint and save the response as a file. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await send(path, { method: "GET" });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
