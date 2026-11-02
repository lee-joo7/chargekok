"use client";

// 추천 휴게소 카드 한 장 (DESIGN.md §3.1 추천 카드)
import { useState } from "react";

import { FIRST_REASON_TEXT } from "@/lib/texts";
import type { Recommendation } from "@/lib/types";

type Props = {
  rec: Recommendation;
  receivedAt: number; // 답을 받은 시각 (몇 분 전 정보인지 계산용)
};

export default function RecommendationCard({ rec, receivedAt }: Props) {
  const [copied, setCopied] = useState(false);
  const first = rec.rank === 1;
  const minutesAgo = Math.max(0, Math.round((receivedAt - Date.parse(rec.updatedAt)) / 60_000));
  const { counts } = rec;

  async function copyName() {
    try {
      await navigator.clipboard.writeText(rec.restArea.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사가 막힌 브라우저면 아무것도 하지 않는다 (이름은 화면에 그대로 보임)
    }
  }

  return (
    <article
      className={`rounded-xl border p-3 ${
        first ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`font-semibold ${first ? "text-base" : "text-sm"}`}>
          {first ? "🥇 " : `${rec.rank}순위 · `}
          {rec.restArea.name}
        </h3>
        {rec.hasEpit && <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white">⚡E-pit</span>}
      </div>

      {rec.firstReason && <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">{FIRST_REASON_TEXT[rec.firstReason]}</p>}

      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {rec.restArea.highway} · 출발지에서 약 {rec.kmFromOrigin}km
      </p>
      <p className="mt-1 text-sm">
        급속 {counts.fast} · 완속 {counts.slow}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-semibold text-green-700 dark:text-green-400">가능 {counts.available}</span> · 충전 중 {counts.charging} · 고장{" "}
        {counts.broken}
        {counts.unknown > 0 && ` · 확인 불가 ${counts.unknown}`}
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        약 {minutesAgo}분 전 정보
        {rec.isStale && <span className="ml-1 font-semibold text-amber-600">· 정보가 오래됨</span>}
      </p>
      {rec.connectorUnknown && <p className="mt-1 text-xs text-amber-600">충전구 종류를 확인하세요 (설정에서 차종을 고르면 맞는 충전기만 보여 드려요)</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={copyName}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          aria-label={`${rec.restArea.name} 이름 복사`}
        >
          {copied ? "복사했어요" : "이름 복사"}
        </button>
      </div>
    </article>
  );
}
