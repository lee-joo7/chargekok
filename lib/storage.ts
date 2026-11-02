// 사용자 설정을 이 브라우저(localStorage)에만 저장하고 불러온다 (서버에는 저장하지 않음, PRD 7번)
// Design Ref: DESIGN.md §4.2 UserSettings, §6 보안
import { useSyncExternalStore } from "react";

import type { SavedRoute, UserSettings } from "./types";

const SETTINGS_KEY = "chargekok:settings";
const ROUTES_KEY = "chargekok:routes";
const MAX_SAVED_ROUTES = 10;
const CHANGE_EVENT = "chargekok:storage"; // 같은 탭 안에서 저장했을 때 화면에 알리는 신호

// 사생활 보호 모드 등에서는 localStorage가 막혀 있을 수 있어 항상 감싼다
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // 다른 탭에서 바뀐 경우
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// 같은 글자면 같은 객체를 돌려줘야 화면이 쓸데없이 다시 그려지지 않는다
let cachedRaw: string | null = null;
let cachedSettings: UserSettings | null = null;

function parseSettings(raw: string | null): UserSettings | null {
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  try {
    const value = raw ? (JSON.parse(raw) as Partial<UserSettings>) : null;
    const operatorIds = Array.isArray(value?.operatorIds) ? value.operatorIds.filter((id) => typeof id === "string") : [];
    cachedSettings =
      operatorIds.length > 0
        ? { operatorIds, ...(typeof value?.vehicleId === "string" && { vehicleId: value.vehicleId }) }
        : null;
  } catch {
    cachedSettings = null;
  }
  return cachedSettings;
}

export function saveSettings(settings: UserSettings): boolean {
  return writeRaw(SETTINGS_KEY, JSON.stringify(settings));
}

// 화면에서 쓰는 설정 값. undefined = 아직 브라우저에서 읽기 전(서버 그리기 중), null = 저장된 설정 없음
export function useSettings(): UserSettings | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => parseSettings(readRaw(SETTINGS_KEY)),
    () => undefined,
  );
}

// ── 자주 가는 경로 (PRD 5번 nice) ─────────────────────────

const NO_ROUTES: SavedRoute[] = [];
let cachedRoutesRaw: string | null = null;
let cachedRoutes: SavedRoute[] = NO_ROUTES;

function parseRoutes(raw: string | null): SavedRoute[] {
  if (raw === cachedRoutesRaw) return cachedRoutes;
  cachedRoutesRaw = raw;
  try {
    const value = raw ? (JSON.parse(raw) as SavedRoute[]) : [];
    cachedRoutes = Array.isArray(value)
      ? value.filter((r) => r && typeof r.id === "string" && typeof r.originZoneId === "string" && typeof r.destinationZoneId === "string")
      : NO_ROUTES;
  } catch {
    cachedRoutes = NO_ROUTES;
  }
  return cachedRoutes;
}

export function useSavedRoutes(): SavedRoute[] {
  return useSyncExternalStore(subscribe, () => parseRoutes(readRaw(ROUTES_KEY)), () => NO_ROUTES);
}

// 같은 출발·도착·도로가 이미 있으면 이름만 바꾸고 맨 앞으로, 최대 10개까지
export function saveRoute(route: Omit<SavedRoute, "id">): boolean {
  const current = parseRoutes(readRaw(ROUTES_KEY));
  const same = (r: SavedRoute) =>
    r.originZoneId === route.originZoneId && r.destinationZoneId === route.destinationZoneId && (r.highway ?? "") === (route.highway ?? "");
  const next = [{ ...route, id: `${Date.now()}` }, ...current.filter((r) => !same(r))].slice(0, MAX_SAVED_ROUTES);
  return writeRaw(ROUTES_KEY, JSON.stringify(next));
}

export function removeRoute(id: string): boolean {
  const next = parseRoutes(readRaw(ROUTES_KEY)).filter((r) => r.id !== id);
  return writeRaw(ROUTES_KEY, JSON.stringify(next));
}
