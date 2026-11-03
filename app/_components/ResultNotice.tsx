"use client";

// AI 답변과 별개로, 결과 종류에 맞는 고정 안내를 화면에 보여 준다 (PLAN 작업 16 / DESIGN §3.1 안내 말풍선)
// AI가 문장을 빠뜨려도 규칙상 꼭 알려야 할 내용은 여기서 항상 보인다
import { EMPTY_REASON_TEXT, NOTICE_TEXT } from "@/lib/texts";
import type { StopsResult } from "@/lib/types";

const MAX_CHIPS = 6;

type Props = {
  result: StopsResult;
  onPick: (text: string) => void; // 버튼을 누르면 그 글자를 입력창에 채운다
};

function Box({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const color =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${color}`}>{children}</div>;
}

function Chips({ items, onPick, suffix = "" }: { items: string[]; onPick: (t: string) => void; suffix?: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.slice(0, MAX_CHIPS).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(`${item}${suffix}`)}
          className="h-9 rounded-full border border-current/30 bg-white px-3 text-sm dark:bg-zinc-900"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export default function ResultNotice({ result, onPick }: Props) {
  switch (result.kind) {
    case "ok":
      return (
        <>
          {result.reachableWithoutCharge && <Box tone="info">✅ {NOTICE_TEXT.reachableWithoutCharge}</Box>}
          {result.recommendations.length === 0 && result.emptyReason && <Box tone="warn">{EMPTY_REASON_TEXT[result.emptyReason]}</Box>}
          {!!result.unavailableStations && <Box tone="warn">{NOTICE_TEXT.unavailable(result.unavailableStations)}</Box>}
        </>
      );
    case "outOfScope":
      return <Box tone="warn">{result.why === "같은권역" ? NOTICE_TEXT.sameRegion : NOTICE_TEXT.outOfScope}</Box>;
    case "roadMismatch":
      return (
        <Box tone="warn">
          {NOTICE_TEXT.roadMismatch}
          <Chips items={result.availableHighways} onPick={onPick} suffix="로 갈게요" />
        </Box>
      );
    case "needsMoreInfo":
      // 같은 이름의 구가 여러 곳일 때만 고를 수 있는 버튼을 보여 준다 (배터리 되묻기는 AI 답변으로 충분)
      return result.candidates?.length ? (
        <Box tone="info">
          {NOTICE_TEXT.pickPlace}
          <Chips items={result.candidates} onPick={onPick} />
        </Box>
      ) : null;
  }
}
