// 공공데이터에서 휴게소 충전기의 실시간 상태를 가져온다
// Design Ref: DESIGN.md §4 ④, §4.4 — 충전소 번호로 휴게소에 묶고 60초 동안 재사용
import "server-only";

import { toCharger, type RawCharger } from "./charger-mapping";
import type { Charger, RestArea } from "./types";

const API_URL = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo";
const CACHE_MS = 60_000; // 같은 충전소는 60초 동안 다시 부르지 않는다 (실시간성과 호출 한도의 균형)
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 6; // 한꺼번에 너무 많이 부르지 않도록

type CacheEntry = { at: number; items: RawCharger[] };
const cache = new Map<string, CacheEntry>();

export class ChargerApiError extends Error {}

export type ChargersResult = {
  chargers: Charger[];
  failedStationIds: string[]; // 불러오지 못한 충전소 (그 휴게소는 "확인할 수 없음")
};

// 충전소 하나의 충전기 목록 (캐시 → 없으면 공공데이터 호출, 한 번 다시 시도)
async function fetchStation(stationId: string): Promise<RawCharger[]> {
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

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new ChargerApiError(`HTTP ${res.status}`);
      const body = (await res.json()) as { items?: { item?: RawCharger[] } };
      const items = body.items?.item ?? [];
      cache.set(stationId, { at: Date.now(), items });
      return items;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// 여러 휴게소의 충전기를 한 번에 가져온다. 일부 충전소가 실패해도 나머지는 돌려준다.
export async function getChargers(restAreas: RestArea[]): Promise<ChargersResult> {
  const jobs = restAreas.flatMap((ra) => ra.stationIds.map((stationId) => ({ stationId, restAreaId: ra.id })));
  const chargers: Charger[] = [];
  const failedStationIds: string[] = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((job) => fetchStation(job.stationId)));
    results.forEach((result, k) => {
      const job = batch[k];
      if (result.status === "rejected") {
        failedStationIds.push(job.stationId);
        return;
      }
      for (const raw of result.value) {
        const charger = toCharger(raw, job.restAreaId);
        if (charger) chargers.push(charger);
      }
    });
  }

  // 전부 실패했으면 서비스 장애로 보고 오류를 낸다 (화면에 502 안내)
  if (jobs.length > 0 && failedStationIds.length === jobs.length) {
    throw new ChargerApiError("충전기 정보를 불러올 수 없습니다");
  }
  return { chargers, failedStationIds };
}
