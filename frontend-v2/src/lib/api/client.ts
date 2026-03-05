"use client";
/**
 * lib/api/client.ts
 * Centralized API client with silent 401 refresh, CSRF, and upload support.
 */

import Cookies from "js-cookie";
import { ApiError } from "@/types/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://hedgecore.onrender.com/api";

const CSRF_SAFE = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

function getCsrf(): string {
  return Cookies.get("csrf_token") ?? "";
}

// Zustand store reference — set by AuthProvider to avoid circular imports
let _getToken: () => string | null = () => null;
let _setToken: (t: string) => void = () => {};
let _logout: () => void = () => {};

export function bindAuthStore(
  getToken: () => string | null,
  setToken: (t: string) => void,
  logout: () => void,
) {
  _getToken = getToken;
  _setToken = setToken;
  _logout = logout;
}

// Dedup concurrent refresh calls
let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const data = await res.json();
      _setToken(data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

class ApiClient {
  readonly base = API_BASE;

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = _getToken();
    const method = (options.method ?? "GET").toUpperCase();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!CSRF_SAFE.has(method) ? { "X-CSRF-Token": getCsrf() } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });

    if (res.status === 401) {
      const ok = await silentRefresh();
      if (ok) return this.fetch(path, options);
      _logout();
      throw new ApiError(401, "Session expired");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Request failed" }));
      throw new ApiError(
        res.status,
        body.detail ?? "Request failed",
        body.error_code,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;

    return res.json();
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const token = _getToken();

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-CSRF-Token": getCsrf(),
        // No Content-Type — let browser set multipart boundary
      },
      body: formData,
    });

    if (res.status === 401) {
      const ok = await silentRefresh();
      if (ok) return this.upload(path, formData);
      _logout();
      throw new ApiError(401, "Session expired");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new ApiError(res.status, body.detail ?? "Upload failed");
    }

    return res.json();
  }

  // Convenience wrappers
  get<T>(path: string) {
    return this.fetch<T>(path, { method: "GET" });
  }

  post<T>(path: string, body?: unknown) {
    return this.fetch<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.fetch<T>(path, {
      method: "PATCH",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.fetch<T>(path, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.fetch<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
export { API_BASE };
