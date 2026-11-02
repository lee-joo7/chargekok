// 경로 위 후보 휴게소를 PRD 규칙대로 거르고 순위를 매긴다 (외부 호출 없음)
// Design Ref: DESIGN.md §4 ⑤ / PRD 5번 must ① — 규칙은 AI에 맡기지 않고 여기서 지킨다 (CLAUDE.md 5절)
import { STALE_AFTER_MINUTES, fitsVehicle } from "./charger-mapping";
import type { CandidateStop, RoutePlan } from "./routes";
import type { Charger, ChargerCounts, EmptyReason, Recommendation, StopsResult, Vehicle } from "./types";

const MAX_RECOMMENDATIONS = 3;

export type RecommendInput = {
  plan: RoutePlan;
  usableKm: number; // 주행 가능 거리의 80%
  chargers: Charger[]; // 후보 휴게소들의 실시간 충전기
  operatorIds: string[]; // 사용자가 가입한 충전업체
  vehicle?: Vehicle; // 모르면 충전구 조건은 빼고 센다
  now?: number; // 시험할 때 시각을 고정하려고 둔다
};

type Scored = CandidateStop & { counts: ChargerCounts; newest: number };

function countOf(chargers: Charger[]): ChargerCounts {
  const by = (s: Charger["status"]) => chargers.filter((c) => c.status === s).length;
  return {
    fast: chargers.filter((c) => c.speed === "급속").length,
    slow: chargers.filter((c) => c.speed === "완속").length,
    available: by("가능"),
    charging: by("충전중"),
    broken: by("고장"),
    unknown: by("확인불가"),
  };
}

export function recommend({ plan, usableKm, chargers, operatorIds, vehicle, now = Date.now() }: RecommendInput): Extract<StopsResult, { kind: "ok" }> {
  const members = new Set(operatorIds);

  // 1) 갈 수 있는 거리(80%) 안에 있는 후보만
  const reachable = plan.candidates.filter((c) => c.kmFromOrigin <= usableKm);

  // 2) 휴게소마다 회원 업체 + 맞는 충전구 충전기만 센다
  const scored: Scored[] = reachable.map((c) => {
    const usable = chargers.filter((ch) => ch.restAreaId === c.restArea.id && members.has(ch.operatorId) && fitsVehicle(ch, vehicle));
    const newest = usable.length ? Math.max(...usable.map((ch) => Date.parse(ch.updatedAt))) : 0;
    return { ...c, counts: countOf(usable), newest };
  });

  // 3) 지금 "충전 가능"이 1대 이상인 곳만
  const eligible = scored.filter((s) => s.counts.available >= 1);

  // 4) 1순위 = 가장 멀리 갈 수 있는 곳 (같으면 가능 대수가 많은 곳), 최대 3곳
  const ranked = [...eligible]
    .sort((a, b) => b.kmFromOrigin - a.kmFromOrigin || b.counts.available - a.counts.available)
    .slice(0, MAX_RECOMMENDATIONS);

  const recommendations: Recommendation[] = ranked.map((s, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    restArea: s.restArea,
    kmFromOrigin: s.kmFromOrigin,
    counts: s.counts,
    updatedAt: new Date(s.newest).toISOString(),
    isStale: now - s.newest > STALE_AFTER_MINUTES * 60_000,
    connectorUnknown: !vehicle,
  }));

  return {
    kind: "ok",
    route: { id: plan.route.id, name: plan.route.name, reason: plan.reason },
    totalKm: plan.totalKm,
    reachableWithoutCharge: plan.totalKm <= usableKm,
    recommendations,
    ...(recommendations.length === 0 && { emptyReason: emptyReasonOf(reachable, scored) }),
  };
}

// 추천이 0곳일 때 어느 조건에서 모두 빠졌는지
function emptyReasonOf(reachable: CandidateStop[], scored: Scored[]): EmptyReason {
  if (reachable.length === 0) return "거리부족";
  const memberChargers = scored.reduce((n, s) => n + s.counts.fast + s.counts.slow, 0);
  if (memberChargers === 0) return "회원업체없음";
  return "모두고장"; // 회원 업체 충전기는 있지만 지금 쓸 수 있는 게 없음 (고장·충전 중·확인 불가)
}
