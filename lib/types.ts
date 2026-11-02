// 충전콕에서 쓰는 데이터 모양 모음
// Design Ref: DESIGN.md §4.2 데이터 모양, §4.3 API

// ── 고정 데이터 (data/*.json) ─────────────────────────────

// 휴게소 한쪽 방향 (data/rest-areas.json)
// 상행·하행은 서로 다른 RestArea로 따로 적는다.
export type RestArea = {
  id: string; // 예: "gyeongbu-xx-seoul"
  name: string; // 내비에 찍을 이름, 예: "○○휴게소(서울방향)"
  highway: string; // 예: "경부고속도로"
  signDirection: string; // 표지판에 적힌 방향 글자 그대로, 예: "서울방향", "창원방향"
  stationIds: string[]; // 이 휴게소(이 방향)에 있는 공공데이터 충전소 번호
};

// 경로 위 휴게소 한 지점 (북쪽·남쪽 방향 휴게소를 함께 적는다)
export type RouteStop = {
  km: number; // 이 경로의 남쪽 끝(부산권 쪽)에서부터 거리
  northbound?: string; // 북쪽으로 갈 때 쓰는 RestArea id
  southbound?: string; // 남쪽으로 갈 때 쓰는 RestArea id
};

// 경로 (data/routes.json)
// 거리는 경로마다 따로 적는다. 같은 휴게소도 경로에 따라 km 값이 다르다.
export type Route = {
  id: string;
  name: string; // 예: "경부고속도로 경유"
  highways: string[]; // 지나는 고속도로 순서 (도로 지정 A를 맞출 때 사용)
  totalKm: number; // 남쪽 끝 → 북쪽 끝 길이
  stops: RouteStop[];
};

export type Region = "수도권" | "부산권";

// 시·군·구가 경로에 올라타는(또는 내리는) 지점
export type ZoneJoin = {
  routeId: string;
  entryName: string; // 예: "○○IC"
  kmToEntry: number; // 시·군·구 중심에서 그 지점까지 대략 거리
  entryKmOnRoute: number; // 그 지점이 경로 위 몇 km 지점인지
};

// 시·군·구 (data/zones.json)
export type Zone = {
  id: string; // 예: "busan-haeundae"
  sido: string; // 예: "부산광역시"
  sigungu: string; // 예: "해운대구"
  region: Region;
  joins: ZoneJoin[];
};

export type Connector = "DC콤보" | "DC차데모" | "AC3상" | "AC완속" | "NACS";

// 차종 (data/vehicles.json)
export type Vehicle = {
  id: string;
  name: string;
  batteryKwh: number; // 배터리 용량
  kmPerKwh: number; // 전비
  connectors: Connector[]; // 충전구 종류
};

// 충전업체 (data/operators.json)
// DESIGN에 모양이 없어 설정 화면에 필요한 최소 값만 둔다.
export type Operator = {
  id: string; // 공공데이터의 업체 구분 값
  name: string; // 화면에 보여 줄 이름
};

// ── 실시간 데이터 ─────────────────────────────────────────

export type ChargerStatus = "가능" | "충전중" | "고장" | "확인불가";

// 충전기 한 대의 지금 상태 (공공데이터에서 받아 변환)
export type Charger = {
  stationId: string; // 공공데이터 충전소 번호 (RestArea.stationIds와 연결)
  restAreaId: string;
  operatorId: string; // 충전업체
  speed: "급속" | "완속";
  connectors: Connector[];
  outputKw: number | null; // 충전기 출력(kW), 모르면 null
  status: ChargerStatus;
  updatedAt: string; // 상태 갱신 시각
};

// ── 추천 결과 ─────────────────────────────────────────────

// 회원 업체이면서 충전구가 맞는 충전기만 센다 (차종이 없으면 충전구 조건은 빼고 센다)
// fast + slow = available + charging + broken + unknown
export type ChargerCounts = {
  fast: number;
  slow: number;
  available: number;
  charging: number;
  broken: number;
  unknown: number;
};

// 추천 결과 한 곳
export type Recommendation = {
  rank: 1 | 2 | 3;
  restArea: RestArea;
  kmFromOrigin: number;
  counts: ChargerCounts;
  updatedAt: string; // 센 충전기 중 가장 오래된 갱신 시각
  isStale: boolean; // updatedAt이 10분 넘게 지남
  connectorUnknown: boolean; // 차종을 몰라 충전구 확인 필요
};

export type EmptyReason = "회원업체없음" | "모두고장" | "거리부족";

// 추천 계산 결과 전체 (find_charging_stops 도구가 돌려주는 값)
export type StopsResult =
  | {
      kind: "ok";
      route: { id: string; name: string; reason: string | null };
      totalKm: number;
      reachableWithoutCharge: boolean;
      recommendations: Recommendation[]; // 0~3개
      emptyReason?: EmptyReason; // 0개일 때 이유
    }
  | { kind: "needsMoreInfo"; ask: "배터리" | "차종또는km" }
  | { kind: "outOfScope"; why: "지역밖" | "같은권역" }
  | { kind: "roadMismatch"; availableHighways: string[] };

// ── 브라우저 저장 값 (localStorage) ──────────────────────

export type UserSettings = {
  operatorIds: string[];
  vehicleId?: string;
};

export type SavedRoute = {
  id: string;
  label: string;
  originZoneId: string;
  destinationZoneId: string;
  highway?: string;
};

// ── 챗봇 API (POST /api/chat) ────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[]; // 최근 10개까지
  settings: UserSettings;
};

// AI가 알아들은 출발·도착 (범위 밖이거나 아직 못 알아들었으면 null)
export type Understood = {
  originZoneId: string | null;
  originLabel: string | null;
  destinationZoneId: string | null;
  destinationLabel: string | null;
  highway: string | null;
};

export type ChatResponse = {
  reply: string;
  understood: Understood;
  result: StopsResult;
};

export type ChatErrorResponse = {
  error: string; // 화면에 그대로 보여 줄 한국어 문구
};
