// 챗봇 질문 하나를 처리하는 서버 API (POST /api/chat)
// Design Ref: DESIGN.md §4.3 API — 입력 확인 → AI + 추천 도구 → 답변. 오류는 화면에 보여 줄 한국어 문구로.
import OpenAI from "openai";

import { chat } from "@/lib/ai";
import { ChargerApiError } from "@/lib/chargers";
import type { ChatErrorResponse, ChatMessage, ChatRequest, ChatResponse } from "@/lib/types";

const MAX_INPUT_CHARS = 500; // 질문 한 번은 500자까지 (PRD 7번)
const MAX_HISTORY = 10; // AI에 보내는 대화는 최근 10개까지

const fail = (status: number, error: string) => Response.json({ error } satisfies ChatErrorResponse, { status });

function isMessage(m: unknown): m is ChatMessage {
  const v = m as ChatMessage;
  return !!v && (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return fail(400, "질문을 입력해 주세요");
  }

  const messages = Array.isArray(body?.messages) ? body.messages.filter(isMessage) : [];
  const last = messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim()) return fail(400, "질문을 입력해 주세요");
  if (last.content.length > MAX_INPUT_CHARS) return fail(400, `질문은 ${MAX_INPUT_CHARS}자까지 쓸 수 있어요`);

  const operatorIds = Array.isArray(body.settings?.operatorIds) ? body.settings.operatorIds.filter((id) => typeof id === "string") : [];
  if (operatorIds.length === 0) return fail(400, "충전업체를 먼저 골라 주세요");
  const vehicleId = typeof body.settings?.vehicleId === "string" ? body.settings.vehicleId : undefined;

  try {
    const recent = messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT_CHARS) }));
    const answer = await chat(recent, { operatorIds, vehicleId });
    return Response.json(answer satisfies ChatResponse);
  } catch (error) {
    // 공공데이터나 AI 서비스가 응답하지 않을 때
    if (error instanceof ChargerApiError || error instanceof OpenAI.APIError) {
      console.error("[chat] 외부 서비스 오류:", error.message);
      return fail(502, "충전기 정보를 지금 불러올 수 없어요. 잠시 후 다시 시도해 주세요");
    }
    console.error("[chat] 서버 오류:", error);
    return fail(500, "문제가 생겼어요. 다시 시도해 주세요");
  }
}
