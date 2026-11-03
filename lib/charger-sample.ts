// 연습용 가짜 충전기 정보 (공공데이터가 멈췄을 때 개발 화면에서만 앱 흐름을 확인하려고 쓴다)
// `npm run dev:sample`로 띄웠을 때만 쓰이고, 배포(production)에서는 절대 쓰지 않는다
import type { RawCharger } from "./charger-mapping";

// 충전소 번호가 같으면 늘 같은 결과가 나오도록 번호로 숫자를 만든다
function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// 지금보다 약 30분 전 한국 시각 ("20261103150000" 모양, 공공데이터가 평소 30분쯤 늦는 것과 맞춤)
function kstMinutesAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60_000 + 9 * 60 * 60_000);
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

// 충전소 하나에 급속 충전기 4대를 만든다. 업체 코드는 충전소 번호 앞 두 글자(ME, KP, HD 등)를 쓴다
export function sampleChargers(stationId: string): RawCharger[] {
  const seed = seedOf(stationId);
  const busiId = stationId.slice(0, 2);
  // 상태: 2 충전대기, 3 충전중, 5 점검중 — 충전소마다 섞이게
  const pattern = ["2", "3", "2", "5", "3", "2", "3", "3"];
  return Array.from({ length: 4 }, (_, i) => ({
    statId: stationId,
    chgerId: String(i + 1).padStart(2, "0"),
    chgerType: "04",
    busiId,
    stat: pattern[(seed + i * 3) % pattern.length],
    statUpdDt: kstMinutesAgo(25 + (seed % 10)),
    output: busiId === "HD" ? "350" : "100",
    delYn: "N",
    limitYn: "N",
  }));
}
