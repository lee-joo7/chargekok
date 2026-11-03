// 공공데이터에서 휴게소 충전기의 실시간 상태를 가져온다
// Design Ref: DESIGN.md §4 ④, §4.4 — 충전소 번호로 휴게소에 묶고 60초 동안 재사용
import "server-only";

import { toCharger, type RawCharger } from "./charger-mapping";
import type { Charger, RestArea } from "./types";

const API_URL = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo";
const CACHE_MS = 60_000; // 같은 충전소는 60초 동안 다시 부르지 않는다 (실시간성과 호출 한도의 균형)
// 공공데이터가 느릴 때 15초쯤 걸려 오는 응답도 받으려고 넉넉히 기다린다 (2026-11-03 측정: 0.1초~15.7초, 일부는 무응답)
const TIMEOUT_MS = 20_000; // 충전소 하나를 기다리는 최대 시간
const DEADLINE_MS = 40_000; // 전체를 기다리는 최대 시간 (AI 답변까지 합쳐 1분 이내 목표, PLAN SC-1)
const CONCURRENCY = 6; // 한꺼번에 너무 많이 부르지 않도록

type CacheEntry = { at: number; items: RawCharger[] };
const cache = new Map<string, CacheEntry>();

export class ChargerApiError extends Error {}

export type ChargersResult = {
  chargers: Charger[];
  failedStationIds: string[]; // 불러오지 못한 충전소 (그 휴게소는 "확인할 수 없음")
};

// 충전소 하나의 충전기 목록 (캐시 → 없으면 공공데이터 호출, 남은 시간이 넉넉하면 한 번 다시 시도)
async function fetchStation(stationId: string, deadline: number): Promise<RawCharger[]> {
  const hit = cache.get(stationId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new ChargerApiError("공공데이터 키가 없습니다");

  const url = new URL(API_URL);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("statId", stationId);
  url.searchParams.set("dataType", "JSON");

  let lastError: unknown = new ChargerApiError("시간 초과");
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 1_000) break; // 전체 기다림 시간이 거의 끝났으면 더 부르지 않는다
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, left)) });
      if (!res.ok) throw new ChargerApiError(`HTTP ${res.status}`);
      const body = (await res.json()) as { items?: { item?: RawCharger[] } };
      const items = body.items?.item ?? [];
      cache.set(stationId, { at: Date.now(), items });
      return items;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof ChargerApiError ? lastError : new ChargerApiError(reasonOf(lastError));
}

// 실패 이유를 짧게 (주소에 키가 들어 있으므로 주소는 남기지 않는다)
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return "알 수 없는 오류";
  const cause = (error as Error & { cause?: { code?: string } }).cause?.code;
  return cause ? `${error.name} (${cause})` : error.name;
}

// 여러 휴게소의 충전기를 한 번에 가져온다.
// 공공데이터가 반쯤 느릴 때도 받을 수 있는 만큼 받는다: 6곳씩 나눠 부르되 느린 곳이 다른 곳을 막지 않게 하고,
// 전체 40초가 지나면 남은 충전소는 "불러오지 못함"으로 두고 끝낸다.
export async function getChargers(restAreas: RestArea[]): Promise<ChargersResult> {
  const jobs = restAreas.flatMap((ra) => ra.stationIds.map((stationId) => ({ stationId, restAreaId: ra.id })));
  const chargers: Charger[] = [];
  const failedStationIds: string[] = [];
  let firstFailure = "";
  const deadline = Date.now() + DEADLINE_MS;
  let next = 0;

  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        for (const raw of await fetchStation(job.stationId, deadline)) {
          const charger = toCharger(raw, job.restAreaId);
          if (charger) chargers.push(charger);
        }
      } catch (error) {
        failedStationIds.push(job.stationId);
        firstFailure ||= error instanceof Error ? error.message : String(error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  // 전부 실패했으면 서비스 장애로 보고 오류를 낸다 (화면에 502 안내)
  if (jobs.length > 0 && failedStationIds.length === jobs.length) {
    throw new ChargerApiError(`충전기 정보를 불러올 수 없습니다: ${firstFailure}`);
  }
  return { chargers, failedStationIds };
}
