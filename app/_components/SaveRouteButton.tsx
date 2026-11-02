"use client";

// 답변 아래 [이 경로 저장]: 이름을 붙여 자주 가는 경로로 저장한다 (PRD 5번 nice)
import { useState } from "react";

import { saveRoute } from "@/lib/storage";
import type { Understood } from "@/lib/types";

export default function SaveRouteButton({ understood }: { understood: Understood }) {
  const { originZoneId, originLabel, destinationZoneId, destinationLabel, highway } = understood;
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);

  // 출발·도착을 모두 알아들은 답에만 보여 준다
  if (!originZoneId || !originLabel || !destinationZoneId || !destinationLabel) return null;
  if (saved) return <p className="text-xs text-green-700 dark:text-green-400">자주 가는 경로에 저장했어요</p>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-10 self-start rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700">
        ☆ 이 경로 저장
      </button>
    );
  }

  const fallback = `${originLabel.split(" ").at(-1)} → ${destinationLabel.split(" ").at(-1)}`;
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = saveRoute({
          label: label.trim() || fallback,
          originZoneId,
          originLabel,
          destinationZoneId,
          destinationLabel,
          ...(highway && { highway }),
        });
        if (ok) setSaved(true);
      }}
    >
      <label htmlFor={`route-name-${originZoneId}-${destinationZoneId}`} className="sr-only">
        경로 이름
      </label>
      <input
        id={`route-name-${originZoneId}-${destinationZoneId}`}
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={20}
        placeholder={`이름 (예: 출장길) · 비우면 ${fallback}`}
        className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button type="submit" className="h-10 shrink-0 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white">
        저장
      </button>
    </form>
  );
}
