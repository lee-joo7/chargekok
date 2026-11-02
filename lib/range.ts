// 배터리 %나 주행 가능 거리(km)로 "갈 수 있는 거리"를 계산한다
// Design Ref: DESIGN.md §4 ③ / PRD 5번 must ① — km가 있으면 km, %만 있으면 차종으로 계산, 모자라면 되묻기
import vehiclesData from "../data/vehicles.json" with { type: "json" };
import type { StopsResult, Vehicle } from "./types";

const vehicles = vehiclesData as Vehicle[];

// 주행 가능 거리의 80%까지만 추천한다 (20%는 여유로 남김, PRD 규칙)
export const SAFETY_RATIO = 0.8;
// 이보다 큰 km는 잘못 들은 값으로 보고 다시 묻는다
const MAX_RANGE_KM = 1000;

export type RangeInput = {
  percent?: number | null; // 배터리 %
  km?: number | null; // 계기판의 주행 가능 거리
  vehicleId?: string | null;
};

export type RangeResult =
  | {
      kind: "ok";
      rangeKm: number; // 지금 갈 수 있는 거리
      usableKm: number; // 추천에 쓰는 거리 (80%)
      source: "km" | "percent"; // 어느 값으로 계산했는지
    }
  | Extract<StopsResult, { kind: "needsMoreInfo" }>;

export function getVehicle(id: string | null | undefined): Vehicle | undefined {
  return id ? vehicles.find((v) => v.id === id) : undefined;
}

const valid = (n: number | null | undefined, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max;

export function calcRange({ percent, km, vehicleId }: RangeInput): RangeResult {
  // km가 있으면 km를 쓴다 (계기판 값이 차 상태를 가장 잘 반영함)
  if (valid(km, MAX_RANGE_KM)) {
    return { kind: "ok", rangeKm: Math.round(km), usableKm: Math.floor(km * SAFETY_RATIO), source: "km" };
  }
  if (valid(percent, 100)) {
    const vehicle = getVehicle(vehicleId);
    // %만 있고 차종도 없으면 차종이나 km를 한 번 되묻는다
    if (!vehicle) return { kind: "needsMoreInfo", ask: "차종또는km" };
    const rangeKm = (percent / 100) * vehicle.batteryKwh * vehicle.kmPerKwh;
    return { kind: "ok", rangeKm: Math.round(rangeKm), usableKm: Math.floor(rangeKm * SAFETY_RATIO), source: "percent" };
  }
  // 둘 다 없거나 말이 안 되는 값이면 배터리를 묻는다
  return { kind: "needsMoreInfo", ask: "배터리" };
}
