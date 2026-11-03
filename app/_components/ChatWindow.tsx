"use client";

// 대화 영역(③)과 입력 영역(④): 질문을 /api/chat에 보내고 답과 추천 카드를 보여 준다 (DESIGN.md §3)
import { useEffect, useRef, useState } from "react";

import type { ChatErrorResponse, ChatMessage, ChatResponse, UserSettings } from "@/lib/types";

import RecommendationCard from "./RecommendationCard";
import ResultNotice from "./ResultNotice";
import SaveRouteButton from "./SaveRouteButton";
import SavedRoutes, { routeQuestion } from "./SavedRoutes";

const MAX_INPUT_CHARS = 500;
const MAX_HISTORY = 10;

type Bubble =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; answer?: ChatResponse; receivedAt: number }
  | { role: "error"; content: string };

export default function ChatWindow({ settings }: { settings: UserSettings }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 저장된 경로를 누르면 질문을 채우고, 배터리만 이어서 쓰도록 입력창 끝에 커서를 둔다
  function pickRoute(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  }

  // 새 말풍선이 생기면 맨 아래로 내린다
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: Bubble[] = [...bubbles, { role: "user", content: text }];
    setBubbles(next);
    setInput("");
    setLoading(true);

    // 서버에는 글자만, 최근 10개까지 보낸다 (오류 말풍선은 빼고)
    const messages: ChatMessage[] = next
      .filter((b): b is Exclude<Bubble, { role: "error" }> => b.role !== "error")
      .map((b) => ({ role: b.role, content: b.content }))
      .slice(-MAX_HISTORY);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, settings }),
      });
      const body = (await res.json()) as ChatResponse | ChatErrorResponse;
      if (!res.ok || "error" in body) {
        setBubbles((b) => [...b, { role: "error", content: "error" in body ? body.error : "문제가 생겼어요. 다시 시도해 주세요" }]);
      } else {
        setBubbles((b) => [...b, { role: "assistant", content: body.reply, answer: body, receivedAt: Date.now() }]);
      }
    } catch {
      setBubbles((b) => [...b, { role: "error", content: "인터넷 연결을 확인하고 다시 시도해 주세요" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <SavedRoutes onPick={(r) => pickRoute(routeQuestion(r))} />
      <div className="flex flex-col gap-3 pb-4" aria-live="polite">
        {bubbles.length === 0 && (
          <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            출발지와 도착지, 배터리를 알려 주세요.
            <br />
            예: &ldquo;해운대에서 수원 가요, 배터리 70%&rdquo;
          </p>
        )}

        {bubbles.map((b, i) => {
          if (b.role === "user") {
            return (
              <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
                {b.content}
              </p>
            );
          }
          if (b.role === "error") {
            return (
              <p key={i} role="alert" className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {b.content}
              </p>
            );
          }
          const { answer } = b;
          const understood = answer?.understood;
          const result = answer?.result;
          return (
            <div key={i} className="flex max-w-[95%] flex-col gap-2 self-start">
              {understood?.originLabel && understood.destinationLabel && (
                <p className="text-xs text-zinc-500">
                  {understood.originLabel} → {understood.destinationLabel}
                  {understood.highway ? ` · ${understood.highway}` : ""}
                </p>
              )}
              <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">{b.content}</p>
              {answer?.sampleData && result && (
                <p role="note" className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  연습 모드: 실제가 아닌 가짜 충전기 정보로 만든 추천이에요
                </p>
              )}
              {result && <ResultNotice result={result} onPick={pickRoute} />}
              {result?.kind === "ok" && (
                <>
                  <p className="text-xs text-zinc-500">
                    {result.route.name} · 약 {result.totalKm}km{result.route.reason ? ` · ${result.route.reason}` : ""}
                  </p>
                  {result.recommendations.map((rec) => (
                    <RecommendationCard key={rec.restArea.id} rec={rec} receivedAt={b.receivedAt} />
                  ))}
                </>
              )}
              {/* 안내할 수 있는 경로일 때만 저장 버튼 (범위 밖·도로 불일치·어느 구인지 되묻기면 숨김) */}
              {understood &&
                (result?.kind === "ok" || (result?.kind === "needsMoreInfo" && (result.ask === "배터리" || result.ask === "차종또는km"))) && (
                  <SaveRouteButton understood={understood} />
                )}
            </div>
          );
        })}

        {loading && <p className="self-start rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-900">찾는 중…</p>}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 flex flex-col gap-1 border-t border-zinc-200 bg-background px-4 pt-2 pb-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p className="text-xs text-zinc-500">※ 동네 이름이나 역 이름 정도면 충분해요</p>
        <div className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            질문
          </label>
          <input
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={MAX_INPUT_CHARS}
            placeholder="질문을 입력하세요"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-12 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            보내기
          </button>
        </div>
      </form>
    </div>
  );
}
