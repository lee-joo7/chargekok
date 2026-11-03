// OpenAI로 질문을 이해하고, 추천 도구(find_charging_stops)를 실행해 그 결과로만 답한다
// Design Ref: DESIGN.md §4.1 AI 사용 방식 — 규칙은 코드가 지키고 AI는 이해와 전달만 맡는다
import "server-only";

import OpenAI from "openai";
import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { getChargers } from "./chargers";
import { calcRange, getVehicle } from "./range";
import { recommend } from "./recommend";
import { planRoute } from "./routes";
import { EMPTY_REASON_TEXT, FIRST_REASON_TEXT } from "./texts";
import { findZone, zoneLabel } from "./zones";
import type { ChatMessage, StopsResult, Understood, UserSettings, Zone } from "./types";

// 모델은 이 상수 하나만 바꾸면 된다 (빠르고 저렴한 챗봇용 모델)
export const MODEL = "gpt-5.4-mini";

const SYSTEM_PROMPT = `너는 "충전콕"이라는 전기차 충전 안내 챗봇이다. 한국어로 짧고 친절하게 답한다.

할 일
- 사용자가 출발지·도착지를 말하면 find_charging_stops 도구를 불러 충전할 휴게소를 찾는다.
- 주소는 시·도와 시·군·구까지만 뽑아서 도구에 넣는다. 동·번지·아파트 이름 같은 자세한 주소는 버린다.
- 시·도는 확실할 때만 채운다. 동네·역·건물 이름은 그곳이 속한 시·군·구로 바꾼다.
- 중구·동구·서구·남구·북구·강서구처럼 여러 도시에 같은 이름이 있는 구를 시·도 없이 말했으면, 시·도를 짐작하지 말고 null로 둔다 (도구가 어느 도시인지 되묻게 한다).
  예: 해운대 우동 → 부산 해운대구 / 강남역 → 서울 강남구 / 송도 → 인천 연수구 / 영통 → 경기 수원시 / 분당·판교 → 경기 성남시 / 인천공항·영종도 → 인천 영종구
- 인천은 2026년 7월부터 구가 바뀌었다: 옛 중구·동구 내륙 → 제물포구, 영종도 → 영종구, 옛 서구 검단 지역 → 검단구, 옛 서구 나머지 → 서해구.
- "서울", "부산"처럼 도시 이름만 말했으면 origin_sigungu나 destination_sigungu에 그 도시 이름을 그대로 넣는다.
- 배터리 %와 주행 가능 거리(km)는 사용자가 말한 것만 넣는다. 둘 다 말했으면 둘 다 넣는다.
- 사용자가 특정 고속도로로 가겠다고 하면 highway에 그 이름을 넣는다. 말하지 않았으면 비워 둔다.
- 출발지나 도착지를 아직 말하지 않았으면 도구를 부르지 말고 물어본다.

반드시 지킬 규칙
- 휴게소 이름, 거리, 충전기 수, 시각은 도구 결과에 있는 것만 쓴다. 결과에 없는 휴게소나 숫자는 절대 지어내지 않는다. 모르는 것은 "확인할 수 없음"이라고 말한다.
- 휴게소 이름은 도구 결과의 name을 그대로 쓴다 (방향이 들어 있어 내비에 그대로 찍을 수 있다).
- kind가 ok이면: reachableWithoutCharge가 true면 "충전 없이 도착할 수 있어요"를 먼저 말한다. 그다음 1순위 휴게소와 firstReasonText, 이용할 고속도로, 출발지에서 거리, 충전 가능 대수를 말한다. 경로 reason이 있으면 한 줄로 덧붙인다. 2·3순위는 이름과 거리만 짧게.
- stale이 true인 곳은 "정보가 오래됨"이라고 알린다. connectorUnknown이 true면 "충전구 종류를 확인하세요"라고 알린다.
- 충전기 상태는 약 30분 늦을 수 있다고 한 번만 짧게 알린다.
- kind가 ok인데 추천이 없으면 emptyReasonText를 그대로 전한다.
- kind가 needsMoreInfo이면 askText대로 한 가지만 묻는다. candidates가 있으면 그중 어디인지 묻는다.
- kind가 outOfScope이면 "지금은 수도권(서울·인천·경기)과 부산권(부산·울산·경남) 사이 고속도로만 안내해요"라고 답한다.
- kind가 roadMismatch이면 그 도로로는 갈 수 없다고 하고 availableHighways 중에서 다시 고르게 한다.
- 답은 5줄 안팎으로 짧게 쓴다.`;

const TOOL: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "find_charging_stops",
    description: "출발·도착 시·군·구와 배터리로 경로와 충전할 휴게소(최대 3곳)를 찾는다. 결과는 회원 업체·충전구·거리 규칙이 이미 적용된 값이다.",
    parameters: {
      type: "object",
      properties: {
        origin_sido: { type: ["string", "null"], description: "출발지 시·도 (예: 부산, 경기). 모르면 null" },
        origin_sigungu: { type: "string", description: "출발지 시·군·구 (예: 해운대구, 수원시)" },
        destination_sido: { type: ["string", "null"], description: "도착지 시·도. 모르면 null" },
        destination_sigungu: { type: "string", description: "도착지 시·군·구" },
        battery_percent: { type: ["number", "null"], description: "배터리 %. 말하지 않았으면 null" },
        range_km: { type: ["number", "null"], description: "계기판의 주행 가능 거리(km). 말하지 않았으면 null" },
        highway: { type: ["string", "null"], description: "사용자가 정한 고속도로 이름. 정하지 않았으면 null" },
      },
      required: ["origin_sido", "origin_sigungu", "destination_sido", "destination_sigungu", "battery_percent", "range_km", "highway"],
      additionalProperties: false,
    },
    strict: true,
  },
};

type ToolArgs = {
  origin_sido: string | null;
  origin_sigungu: string;
  destination_sido: string | null;
  destination_sigungu: string;
  battery_percent: number | null;
  range_km: number | null;
  highway: string | null;
};

const ASK_TEXT = {
  배터리: "지금 배터리가 몇 %인지, 또는 계기판의 주행 가능 거리를 물어본다.",
  차종또는km: "차종을 설정에서 골라 주시거나, 계기판의 주행 가능 거리(km)를 알려 달라고 한다.",
  출발지: "출발지가 정확히 어느 시·군·구인지 묻는다. candidates는 예시로만 보여 준다.",
  도착지: "도착지가 정확히 어느 시·군·구인지 묻는다. candidates는 예시로만 보여 준다.",
} as const;

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI 키가 없습니다");
  client ??= new OpenAI();
  return client;
}

// find_charging_stops 도구의 실제 실행: 지역 → 경로 → 거리 → 실시간 충전기 → 추천 (모두 코드가 계산)
async function findChargingStops(args: ToolArgs, settings: UserSettings): Promise<{ result: StopsResult; understood: Understood }> {
  const understood: Understood = { originZoneId: null, originLabel: null, destinationZoneId: null, destinationLabel: null, highway: args.highway };

  const pick = (sigungu: string, sido: string | null, ask: "출발지" | "도착지"): Zone | StopsResult => {
    const found = findZone(sigungu, sido);
    if (found.kind === "found") return found.zone;
    if (found.kind === "ambiguous") return { kind: "needsMoreInfo", ask, candidates: found.candidates.map(zoneLabel) };
    return { kind: "outOfScope", why: "지역밖" };
  };
  const origin = pick(args.origin_sigungu, args.origin_sido, "출발지");
  if ("kind" in origin) return { result: origin, understood };
  understood.originZoneId = origin.id;
  understood.originLabel = zoneLabel(origin);
  const destination = pick(args.destination_sigungu, args.destination_sido, "도착지");
  if ("kind" in destination) return { result: destination, understood };
  understood.destinationZoneId = destination.id;
  understood.destinationLabel = zoneLabel(destination);

  const decision = planRoute(origin, destination, args.highway);
  if (decision.kind !== "ok") return { result: decision, understood };

  const range = calcRange({ percent: args.battery_percent, km: args.range_km, vehicleId: settings.vehicleId });
  if (range.kind !== "ok") return { result: range, understood };

  // 갈 수 있는 거리 안의 휴게소만 실시간 상태를 부른다 (공공데이터 호출을 줄이려고)
  const reachable = decision.plan.candidates.filter((c) => c.kmFromOrigin <= range.usableKm).map((c) => c.restArea);
  const { chargers, failedStationIds } = reachable.length ? await getChargers(reachable) : { chargers: [], failedStationIds: [] };
  const recommended = recommend({
    plan: decision.plan,
    usableKm: range.usableKm,
    chargers,
    operatorIds: settings.operatorIds,
    vehicle: getVehicle(settings.vehicleId),
  });
  // 일부 충전소를 못 불러왔으면 숨기지 않고 함께 알린다
  const result = failedStationIds.length ? { ...recommended, unavailableStations: failedStationIds.length } : recommended;
  return { result, understood };
}

// AI에게 넘길 도구 결과 (필요한 값만, 바로 말로 옮길 수 있게)
function toToolMessage(result: StopsResult, understood: Understood, now = Date.now()) {
  const base = { understood: { origin: understood.originLabel, destination: understood.destinationLabel } };
  // 후보가 너무 많으면(예: 경기도 31곳) 다 나열하지 않고 몇 개만 예로 든다
  if (result.kind === "needsMoreInfo") return { ...base, kind: result.kind, askText: ASK_TEXT[result.ask], candidates: result.candidates?.slice(0, 6) };
  if (result.kind !== "ok") return { ...base, ...result };
  return {
    ...base,
    kind: "ok",
    route: result.route,
    totalKm: result.totalKm,
    reachableWithoutCharge: result.reachableWithoutCharge,
    recommendations: result.recommendations.map((r) => ({
      rank: r.rank,
      name: r.restArea.name,
      highway: r.restArea.highway,
      kmFromOrigin: r.kmFromOrigin,
      counts: r.counts,
      minutesAgo: Math.max(0, Math.round((now - Date.parse(r.updatedAt)) / 60_000)),
      stale: r.isStale,
      epit: r.hasEpit,
      connectorUnknown: r.connectorUnknown,
      ...(r.firstReason && { firstReasonText: FIRST_REASON_TEXT[r.firstReason] }),
    })),
    ...(result.emptyReason && { emptyReasonText: EMPTY_REASON_TEXT[result.emptyReason] }),
    ...(result.unavailableStations && { note: `충전소 ${result.unavailableStations}곳의 정보를 불러오지 못해 일부 휴게소는 확인할 수 없음` }),
  };
}

export async function chat(messages: ChatMessage[], settings: UserSettings): Promise<{ reply: string; understood: Understood; result: StopsResult | null }> {
  const history: ChatCompletionMessageParam[] = [
    { role: "developer", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const first = await openai().chat.completions.create({ model: MODEL, messages: history, tools: [TOOL] });
  const message = first.choices[0]?.message;
  const call = message?.tool_calls?.find((t) => t.type === "function" && t.function.name === TOOL.function.name);

  const noTool: Understood = { originZoneId: null, originLabel: null, destinationZoneId: null, destinationLabel: null, highway: null };
  if (!message || !call || call.type !== "function") {
    return { reply: message?.content?.trim() || "다시 한 번 말씀해 주세요.", understood: noTool, result: null };
  }

  const args = JSON.parse(call.function.arguments) as ToolArgs;
  const { result, understood } = await findChargingStops(args, settings);

  // 도구 결과를 주고 답변 문장을 받는다 (도구는 한 번만 쓰게 한다)
  const second = await openai().chat.completions.create({
    model: MODEL,
    messages: [
      ...history,
      { role: "assistant", content: message.content ?? null, tool_calls: [call] },
      { role: "tool", tool_call_id: call.id, content: JSON.stringify(toToolMessage(result, understood)) },
    ],
  });
  const reply = second.choices[0]?.message?.content?.trim() || "답을 만들지 못했어요. 다시 시도해 주세요.";
  return { reply, understood, result };
}
