// 공공데이터 충전기 응답을 우리 데이터 모양(Charger)으로 바꾸는 규칙
// Design Ref: DESIGN.md §4.4 공공데이터 연결 메모
// 외부 호출이 없는 순수 함수만 둔다 (서버·화면 어디서든 써도 안전)
import type { Charger, ChargerStatus, Connector, Vehicle } from "./types";

// 휴게소의 가장 최근 갱신이 이보다 오래되면 "정보가 오래됨"으로 본다
// 공공데이터는 평소 약 30분 늦게 반영된다 (2026-11-02 측정: 정상 29~38분, 늦은 곳 47~52분)
export const STALE_AFTER_MINUTES = 40;

// 공공데이터 응답에서 쓰는 칸만 적는다
export type RawCharger = {
  statId: string;
  chgerId: string;
  chgerType: string;
  busiId: string;
  stat: string;
  statUpdDt: string;
  output: string;
  delYn: string;
  limitYn: string;
};

// 충전기 타입 코드 → 충전구와 급속/완속
const CHARGER_TYPES: Record<string, { connectors: Connector[]; speed: "급속" | "완속" }> = {
  "01": { connectors: ["DC차데모"], speed: "급속" },
  "02": { connectors: ["AC완속"], speed: "완속" },
  "03": { connectors: ["DC차데모", "AC3상"], speed: "급속" },
  "04": { connectors: ["DC콤보"], speed: "급속" },
  "05": { connectors: ["DC차데모", "DC콤보"], speed: "급속" },
  "06": { connectors: ["DC차데모", "AC3상", "DC콤보"], speed: "급속" },
  "07": { connectors: ["AC3상"], speed: "급속" },
  "08": { connectors: ["DC콤보"], speed: "완속" },
  "09": { connectors: ["NACS"], speed: "급속" },
  "10": { connectors: ["DC콤보", "NACS"], speed: "급속" },
};

// 상태 코드 → 우리 상태 (1 통신이상, 2 충전대기, 3 충전중, 4 운영중지, 5 점검중, 9 상태미확인)
export function toStatus(stat: string): ChargerStatus {
  switch (stat) {
    case "2":
      return "가능";
    case "3":
      return "충전중";
    case "4":
    case "5":
      return "고장";
    default:
      return "확인불가";
  }
}

// "20261102160408"(한국 시각) → ISO 시각 문자열. 형식이 다르면 null
export function parseKst(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
}

// 응답 한 줄을 Charger로 바꾼다. 삭제됐거나 이용 제한이 있거나 타입을 모르면 null
export function toCharger(raw: RawCharger, restAreaId: string): Charger | null {
  if (raw.delYn === "Y" || raw.limitYn === "Y") return null;
  const type = CHARGER_TYPES[raw.chgerType];
  if (!type) return null;
  const output = Number(raw.output);
  return {
    stationId: raw.statId,
    restAreaId,
    operatorId: raw.busiId,
    speed: type.speed,
    connectors: type.connectors,
    outputKw: Number.isFinite(output) && output > 0 ? output : null,
    status: toStatus(raw.stat),
    // 시각을 읽을 수 없으면 아주 오래된 시각으로 두어 "정보가 오래됨"으로 보이게 한다
    updatedAt: parseKst(raw.statUpdDt) ?? new Date(0).toISOString(),
  };
}

// 이 차가 이 충전기를 쓸 수 있는지 (차종을 모르면 true로 두고 화면에서 "충전구 확인" 안내)
export function fitsVehicle(charger: Charger, vehicle: Vehicle | undefined): boolean {
  if (!vehicle) return true;
  return charger.connectors.some((c) => vehicle.connectors.includes(c));
}
