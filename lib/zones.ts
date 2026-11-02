// 시·군·구 이름으로 zones.json에서 지역을 찾는다
// Design Ref: DESIGN.md §4 ② — 표에 없으면 범위 밖, 같은 이름이 여러 곳이면 되묻기
import zonesData from "../data/zones.json" with { type: "json" };
import type { Zone } from "./types";

const zones = zonesData as Zone[];

// 시·도 줄임말 → 정식 이름
const SIDO_ALIASES: Record<string, string> = {
  서울: "서울특별시", 서울시: "서울특별시", 서울특별시: "서울특별시",
  인천: "인천광역시", 인천시: "인천광역시", 인천광역시: "인천광역시",
  경기: "경기도", 경기도: "경기도",
  부산: "부산광역시", 부산시: "부산광역시", 부산광역시: "부산광역시",
  울산: "울산광역시", 울산시: "울산광역시", 울산광역시: "울산광역시",
  경남: "경상남도", 경상남도: "경상남도",
};

export type ZoneLookup =
  | { kind: "found"; zone: Zone }
  | { kind: "ambiguous"; candidates: Zone[] } // 예: "중구"는 서울·부산·울산에 모두 있음
  | { kind: "notFound" }; // 수도권·부산권 밖이거나 모르는 이름

const clean = (s: string) => s.replace(/\s+/g, "");
// "해운대" → "해운대구"처럼 끝 글자(시·군·구)가 빠져도 맞춘다
const sameName = (input: string, sigungu: string) =>
  input === sigungu || (input.length >= 2 && sigungu.slice(0, -1) === input);

export function getZone(id: string): Zone | undefined {
  return zones.find((z) => z.id === id);
}

// "서울", "부산"처럼 구 없이 도시만 말하면 그 도시의 대표 구(시청이 있는 곳)로 본다
const CITY_DEFAULT: Record<string, string> = {
  서울특별시: "중구",
  부산광역시: "연제구",
  인천광역시: "남동구",
  울산광역시: "남구",
};

// sido는 없어도 된다. AI가 주소에서 뽑은 시·도와 시·군·구 이름을 넣는다.
export function findZone(sigungu: string, sido?: string | null): ZoneLookup {
  let name = clean(sigungu);
  let sidoName = sido ? SIDO_ALIASES[clean(sido)] : undefined;
  // 시·도를 말했는데 수도권·부산권 시·도가 아니면 범위 밖
  if (sido && clean(sido) && !sidoName) return { kind: "notFound" };

  // 시·군·구 자리에 도시 이름만 왔으면 (예: "서울") 대표 구로 바꾼다
  const cityAsName = SIDO_ALIASES[name];
  if (cityAsName && (!sidoName || sidoName === cityAsName)) {
    sidoName = cityAsName;
    name = CITY_DEFAULT[cityAsName] ?? "";
  }
  // 도시만 있고 구가 없으면 대표 구로 (경기도·경상남도는 넓어서 대표 구를 두지 않고 되묻는다)
  if (!name && sidoName) name = CITY_DEFAULT[sidoName] ?? "";
  if (!name) return sidoName ? { kind: "ambiguous", candidates: zones.filter((z) => z.sido === sidoName) } : { kind: "notFound" };

  const matches = zones.filter((z) => sameName(name, z.sigungu) && (!sidoName || z.sido === sidoName));
  if (matches.length === 1) return { kind: "found", zone: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", candidates: matches };
  if (sidoName) {
    // 시·도를 잘못 짚었어도(예: 김해를 부산으로) 시·군·구 이름이 한 곳뿐이면 그곳으로 본다
    const anywhere = zones.filter((z) => sameName(name, z.sigungu));
    if (anywhere.length === 1) return { kind: "found", zone: anywhere[0] };
    // 그래도 못 찾으면, 범위 밖이라 하지 말고 그 시·도의 시·군·구 중에서 되묻는다
    return { kind: "ambiguous", candidates: zones.filter((z) => z.sido === sidoName) };
  }
  return { kind: "notFound" };
}

export function zoneLabel(zone: Zone): string {
  const short = Object.entries(SIDO_ALIASES).find(([alias, full]) => full === zone.sido && alias.length === 2)?.[0];
  return `${short ?? zone.sido} ${zone.sigungu}`;
}
