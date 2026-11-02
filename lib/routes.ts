// 출발·도착 시·군·구와 도로 지정 여부로 경로·진행 방향·후보 휴게소를 정한다
// Design Ref: DESIGN.md §4 ② — A: 지정한 도로를 지나는 경로 / B: 총거리가 가장 짧은 경로
import routesData from "../data/routes.json" with { type: "json" };
import restAreasData from "../data/rest-areas.json" with { type: "json" };
import type { RestArea, Route, StopsResult, Zone, ZoneJoin } from "./types";

const routes = routesData as Route[];
const restAreas = restAreasData as RestArea[];

export type Direction = "north" | "south"; // 부산권→수도권 = north

// 경로 위 후보 휴게소 한 곳 (진행 방향 쪽, 출발 지점과 도착 지점 사이)
export type CandidateStop = {
  restArea: RestArea;
  kmFromOrigin: number; // 출발 시·군·구 중심에서 이 휴게소까지 대략 거리
};

export type RoutePlan = {
  route: Route;
  reason: string | null; // 경로 추천(B)일 때만 이유 한 줄
  direction: Direction;
  totalKm: number; // 출발 시·군·구 → 도착 시·군·구 대략 거리
  candidates: CandidateStop[]; // 출발에서 가까운 순
};

export type RouteDecision =
  | { kind: "ok"; plan: RoutePlan }
  | Extract<StopsResult, { kind: "outOfScope" }>
  | Extract<StopsResult, { kind: "roadMismatch" }>;

// "경부", "경부선", "경부 고속도로" → "경부"
const roadKey = (name: string) => name.replace(/\s+/g, "").replace(/(고속도로|고속국도|선)$/, "");

export function allHighways(): string[] {
  return [...new Set(routes.flatMap((r) => r.highways))];
}

type Measured = { route: Route; from: ZoneJoin; to: ZoneJoin; totalKm: number };

// 경로 하나를 이 출발·도착에 맞춰 잰다. 진행 방향과 맞지 않으면 null
function measure(route: Route, origin: Zone, destination: Zone, direction: Direction): Measured | null {
  const from = origin.joins.find((j) => j.routeId === route.id);
  const to = destination.joins.find((j) => j.routeId === route.id);
  if (!from || !to) return null;
  const forward = direction === "north" ? to.entryKmOnRoute >= from.entryKmOnRoute : to.entryKmOnRoute <= from.entryKmOnRoute;
  if (!forward) return null;
  const totalKm = from.kmToEntry + Math.abs(to.entryKmOnRoute - from.entryKmOnRoute) + to.kmToEntry;
  return { route, from, to, totalKm };
}

// 출발 지점과 도착 지점 사이, 진행 방향 쪽 휴게소만 출발에서 가까운 순으로
function candidatesOf(m: Measured, direction: Direction): CandidateStop[] {
  const lo = Math.min(m.from.entryKmOnRoute, m.to.entryKmOnRoute);
  const hi = Math.max(m.from.entryKmOnRoute, m.to.entryKmOnRoute);
  return m.route.stops
    .filter((s) => s.km >= lo && s.km <= hi)
    .flatMap((s) => {
      const id = direction === "north" ? s.northbound : s.southbound;
      const restArea = id ? restAreas.find((r) => r.id === id) : undefined;
      if (!restArea) return [];
      return [{ restArea, kmFromOrigin: m.from.kmToEntry + Math.abs(s.km - m.from.entryKmOnRoute) }];
    })
    .sort((a, b) => a.kmFromOrigin - b.kmFromOrigin);
}

export function planRoute(origin: Zone, destination: Zone, highway?: string | null): RouteDecision {
  // 같은 권역 안의 이동은 범위 밖 (PRD 6번 비범위)
  if (origin.region === destination.region) return { kind: "outOfScope", why: "같은권역" };
  const direction: Direction = origin.region === "부산권" ? "north" : "south";

  const measured = routes
    .map((r) => measure(r, origin, destination, direction))
    .filter((m): m is Measured => m !== null)
    .sort((a, b) => a.totalKm - b.totalKm);

  // A: 도로를 정했으면 그 도로를 지나는 경로 중, 그 도로 위주로 가는 경로(거쳐 가는 고속도로가 적은 것)를 먼저 고른다
  //    예: "경부로"라고 하면 앞부분만 경부를 지나는 상주영천 경유보다 경부 경유를 고른다
  if (highway && roadKey(highway)) {
    const key = roadKey(highway);
    const picked = measured
      .filter((m) => m.route.highways.some((h) => roadKey(h) === key))
      .sort((a, b) => a.route.highways.length - b.route.highways.length || a.totalKm - b.totalKm)[0];
    if (!picked) {
      const available = [...new Set(measured.flatMap((m) => m.route.highways))];
      return { kind: "roadMismatch", availableHighways: available.length ? available : allHighways() };
    }
    return { kind: "ok", plan: toPlan(picked, direction, null) };
  }

  // B: 총거리가 가장 짧은 경로 + 이유 한 줄
  const best = measured[0];
  if (!best) return { kind: "roadMismatch", availableHighways: allHighways() };
  const next = measured[1];
  const reason = next
    ? `가장 짧은 경로예요 (약 ${best.totalKm}km, ${next.route.name}보다 약 ${next.totalKm - best.totalKm}km 짧아요)`
    : `이 출발·도착을 잇는 경로예요 (약 ${best.totalKm}km)`;
  return { kind: "ok", plan: toPlan(best, direction, reason) };
}

function toPlan(m: Measured, direction: Direction, reason: string | null): RoutePlan {
  return { route: m.route, reason, direction, totalKm: m.totalKm, candidates: candidatesOf(m, direction) };
}
