"use client";

// 처음 설정 화면: E-pit 회원 여부, 가입한 충전업체, 차종 (DESIGN.md §3 ⑤)
import { useState } from "react";

import operatorsData from "@/data/operators.json";
import vehiclesData from "@/data/vehicles.json";
import { EPIT_OPERATOR_ID } from "@/lib/charger-mapping";
import { saveSettings } from "@/lib/storage";
import type { Operator, UserSettings, Vehicle } from "@/lib/types";

const operators = (operatorsData as Operator[]).filter((o) => o.id !== EPIT_OPERATOR_ID); // E-pit은 위 질문으로 따로 묻는다
const vehicles = vehiclesData as Vehicle[];

type Props = {
  initial: UserSettings | null;
  onDone: () => void; // 저장한 뒤 (또는 취소) 설정 화면을 닫는다
  canCancel: boolean; // 이미 설정이 있으면 취소할 수 있다
};

export default function SetupPanel({ initial, onDone, canCancel }: Props) {
  const [epit, setEpit] = useState<boolean | null>(initial ? initial.operatorIds.includes(EPIT_OPERATOR_ID) : null);
  const [picked, setPicked] = useState<string[]>(initial?.operatorIds.filter((id) => id !== EPIT_OPERATOR_ID) ?? []);
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? "");
  const [error, setError] = useState("");

  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  function save() {
    if (epit === null) return setError("E-pit 회원인지 골라 주세요");
    const operatorIds = epit ? [EPIT_OPERATOR_ID, ...picked] : picked;
    if (operatorIds.length === 0) return setError("가입한 충전업체를 하나 이상 골라 주세요");
    const ok = saveSettings({ operatorIds, ...(vehicleId && { vehicleId }) });
    if (!ok) return setError("이 브라우저에서는 설정을 저장할 수 없어요 (사생활 보호 모드인지 확인해 주세요)");
    onDone();
  }

  return (
    <section className="flex flex-col gap-6 py-2" aria-labelledby="setup-title">
      <div>
        <h2 id="setup-title" className="text-lg font-semibold">
          처음 설정
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">이 브라우저에만 저장돼요. 언제든 ⚙ 설정에서 바꿀 수 있어요.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">현대 E-pit 회원이신가요?</legend>
        <p className="-mt-1 mb-1 text-xs text-zinc-500">회원이면 쓸 수 있는 E-pit 충전소를 1순위로 추천해요.</p>
        <div className="flex gap-2">
          {[
            { value: true, label: "예" },
            { value: false, label: "아니오" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={epit === o.value}
              onClick={() => setEpit(o.value)}
              className={`h-11 flex-1 rounded-lg border text-sm font-medium ${
                epit === o.value
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">가입한 충전업체 (여러 개 선택)</legend>
        <p className="-mt-1 mb-1 text-xs text-zinc-500">고른 업체의 충전기만 추천해요.</p>
        <div className="grid grid-cols-2 gap-2">
          {operators.map((o) => (
            <label
              key={o.id}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                picked.includes(o.id)
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                  : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              }`}
            >
              <input type="checkbox" className="size-4 accent-blue-600" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="font-medium">차종 (선택)</span>
        <span className="-mt-1 text-xs text-zinc-500">고르면 배터리 %만 말해도 갈 수 있는 거리를 계산하고, 맞는 충전구만 추천해요.</span>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">건너뛰기 (차종 고르지 않음)</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {canCancel && (
          <button type="button" onClick={onDone} className="h-12 flex-1 rounded-lg border border-zinc-300 text-sm font-medium dark:border-zinc-700">
            취소
          </button>
        )}
        <button type="button" onClick={save} className="h-12 flex-[2] rounded-lg bg-blue-600 text-sm font-semibold text-white">
          저장하고 시작
        </button>
      </div>
    </section>
  );
}
