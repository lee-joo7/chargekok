"use client";

// 한 페이지 안에서 설정 화면과 본 화면을 바꿔 보여 준다 (DESIGN.md §3)
// 처음 접속(저장된 설정 없음)이면 설정 화면부터, 머리글의 ⚙ 설정으로 언제든 다시 연다
import { useState } from "react";

import vehiclesData from "@/data/vehicles.json";
import { useSettings } from "@/lib/storage";
import type { Vehicle } from "@/lib/types";

import ChatWindow from "./ChatWindow";
import SetupPanel from "./SetupPanel";

const vehicles = vehiclesData as Vehicle[];

export default function ChargekokApp() {
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const showSetup = settings === null || editing;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-start justify-between px-4 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold">충전콕</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">고속도로 휴게소 충전 안내</p>
        </div>
        {settings && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          >
            ⚙ 설정
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4">
        {settings === undefined ? null : showSetup ? (
          <SetupPanel initial={settings} canCancel={settings !== null} onDone={() => setEditing(false)} />
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-500">
              충전업체 {settings.operatorIds.length}곳
              {settings.vehicleId ? ` · ${vehicles.find((v) => v.id === settings.vehicleId)?.name ?? "차종"}` : " · 차종 없음"}
            </p>
            <ChatWindow settings={settings} />
          </>
        )}
      </main>
    </div>
  );
}
