"use client";

// 자주 가는 경로 (DESIGN.md §3 ②): 누르면 배터리만 넣으면 되도록 질문을 채워 준다
import { removeRoute, useSavedRoutes } from "@/lib/storage";
import type { SavedRoute } from "@/lib/types";

export function routeQuestion(r: SavedRoute): string {
  return `${r.originLabel}에서 ${r.destinationLabel} 가요${r.highway ? `, ${r.highway}로 갈 거예요` : ""}. 배터리 `;
}

export default function SavedRoutes({ onPick }: { onPick: (r: SavedRoute) => void }) {
  const routes = useSavedRoutes();
  if (routes.length === 0) return null;

  return (
    <section aria-label="자주 가는 경로" className="mb-3">
      <h2 className="mb-1 text-xs font-medium text-zinc-500">자주 가는 경로</h2>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {routes.map((r) => (
          <li key={r.id} className="flex shrink-0 items-center rounded-full border border-zinc-300 dark:border-zinc-700">
            <button type="button" onClick={() => onPick(r)} className="h-10 pl-3 pr-1 text-sm" title={`${r.originLabel} → ${r.destinationLabel}`}>
              {r.label}
            </button>
            <button
              type="button"
              onClick={() => removeRoute(r.id)}
              aria-label={`${r.label} 경로 지우기`}
              className="flex h-10 w-9 items-center justify-center text-zinc-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
