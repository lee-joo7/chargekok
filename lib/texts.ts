// 화면과 AI 답변이 함께 쓰는 안내 문구 (한 곳에서 고치면 둘 다 바뀐다)
import type { EmptyReason, FirstReason } from "./types";

// 1순위를 고른 이유 (PRD 5번 must ①)
export const FIRST_REASON_TEXT: Record<FirstReason, string> = {
  "E-pit회원": "E-pit 회원이라 지금 쓸 수 있는 E-pit 충전기가 있는 휴게소를 1순위로 골랐어요",
  가능2대이상: "충전 가능한 충전기가 2대 이상인 곳 중 가장 멀리 갈 수 있는 곳이에요",
  가장먼곳: "충전 가능 2대 이상인 곳이 없어, 1대라도 있는 곳 중 가장 먼 곳을 골랐어요",
};

// 추천이 0곳일 때 이유
export const EMPTY_REASON_TEXT: Record<EmptyReason, string> = {
  거리부족: "지금 배터리로 여유 있게(80%) 갈 수 있는 거리 안에 휴게소가 없어요. 출발 전에 충전해 주세요.",
  회원업체없음: "갈 수 있는 거리 안의 휴게소에 가입하신 충전업체의 충전기가 없어요.",
  모두고장: "갈 수 있는 거리 안의 휴게소 충전기가 지금 모두 사용 중이거나 고장이에요.",
};
