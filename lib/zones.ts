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

// sido는 없어도 된다. AI가 주소에서 뽑은 시·도와 시·군·구 이름을 넣는다.
export function findZone(sigungu: string, sido?: string | null): ZoneLookup {
  const name = clean(sigungu);
  if (!name) return { kind: "notFound" };

  const sidoName = sido ? SIDO_ALIASES[clean(sido)] : undefined;
  // 시·도를 말했는데 수도권·부산권 시·도가 아니면 범위 밖
  if (sido && clean(sido) && !sidoName) return { kind: "notFound" };

  const matches = zones.filter((z) => sameName(name, z.sigungu) && (!sidoName || z.sido === sidoName));
  if (matches.length === 1) return { kind: "found", zone: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", candidates: matches };
  return { kind: "notFound" };
}

export function zoneLabel(zone: Zone): string {
  const short = Object.entries(SIDO_ALIASES).find(([alias, full]) => full === zone.sido && alias.length === 2)?.[0];
  return `${short ?? zone.sido} ${zone.sigungu}`;
}
