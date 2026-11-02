// 경로 위 후보 휴게소를 PRD 규칙대로 거르고 순위를 매긴다 (외부 호출 없음)
// Design Ref: DESIGN.md §4 ⑤ / PRD 5번 must ① — 규칙은 AI에 맡기지 않고 여기서 지킨다 (CLAUDE.md 5절)
import { STALE_AFTER_MINUTES, fitsVehicle } from "./charger-mapping";
import type { CandidateStop, RoutePlan } from "./routes";
import type { Charger, ChargerCounts, EmptyReason, FirstReason, Recommendation, StopsResult, Vehicle } from "./types";

// 1순위 이유를 화면과 AI 답변에 보여 줄 한 줄
export const FIRST_REASON_TEXT: Record<FirstReason, string> = {
  "E-pit회원": "E-pit 회원이라 지금 쓸 수 있는 E-pit 충전기가 있는 휴게소를 1순위로 골랐어요",
  가능2대이상: "충전 가능한 충전기가 2대 이상인 곳 중 가장 멀리 갈 수 있는 곳이에요",
  가장먼곳: "충전 가능 2대 이상인 곳이 없어, 1대라도 있는 곳 중 가장 먼 곳을 골랐어요",
};

const MAX_RECOMMENDATIONS = 3;
// 정보가 약 30분 늦을 수 있어, 1순위는 "가능"이 이 대수 이상인 곳에서 고른다 (그런 곳이 없을 때만 1대인 곳)
const MIN_AVAILABLE_FOR_FIRST = 2;
// 현대자동차 E-pit 초고속 충전소의 공공데이터 업체 코드. 지금 쓸 수 있는 E-pit이 있으면 1순위로 가장 먼저 고른다 (사용자 요청)
export const EPIT_OPERATOR_ID = "HD";

export type RecommendInput = {
  plan: RoutePlan;
  usableKm: number; // 주행 가능 거리의 80%
  chargers: Charger[]; // 후보 휴게소들의 실시간 충전기
  operatorIds: string[]; // 사용자가 가입한 충전업체
  vehicle?: Vehicle; // 모르면 충전구 조건은 빼고 센다
  now?: number; // 시험할 때 시각을 고정하려고 둔다
};

type Scored = CandidateStop & { counts: ChargerCounts; newest: number; epitAvailable: number };

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
    const epitAvailable = usable.filter((ch) => ch.operatorId === EPIT_OPERATOR_ID && ch.status === "가능").length;
    return { ...c, counts: countOf(usable), newest, epitAvailable };
  });

  // 3) 지금 "충전 가능"이 1대 이상인 곳만
  const eligible = scored.filter((s) => s.counts.available >= 1);

  // 4) 가장 멀리 갈 수 있는 곳부터 (같으면 가능 대수가 많은 곳)
  const byFar = [...eligible].sort((a, b) => b.kmFromOrigin - a.kmFromOrigin || b.counts.available - a.counts.available);
  // 1순위: ① 지금 쓸 수 있는 E-pit이 있는 곳 중 가장 먼 곳 → ② 가능 2대 이상인 곳 중 가장 먼 곳 → ③ 가장 먼 곳
  // 2·3순위는 나머지를 먼 순으로.
  const epitFirst = byFar.find((s) => s.epitAvailable >= 1);
  const twoPlus = byFar.find((s) => s.counts.available >= MIN_AVAILABLE_FOR_FIRST);
  const first = epitFirst ?? twoPlus ?? byFar[0];
  const firstReason: FirstReason = epitFirst ? "E-pit회원" : twoPlus ? "가능2대이상" : "가장먼곳";
  const ranked = first ? [first, ...byFar.filter((s) => s !== first)].slice(0, MAX_RECOMMENDATIONS) : [];

  const recommendations: Recommendation[] = ranked.map((s, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    restArea: s.restArea,
    kmFromOrigin: s.kmFromOrigin,
    counts: s.counts,
    updatedAt: new Date(s.newest).toISOString(),
    isStale: now - s.newest > STALE_AFTER_MINUTES * 60_000,
    connectorUnknown: !vehicle,
    hasEpit: s.epitAvailable >= 1,
    ...(i === 0 && { firstReason }),
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
