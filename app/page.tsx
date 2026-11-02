// 충전콕 첫 화면 (DESIGN.md 3절 ① 머리글)
// 설정·대화·입력 영역은 PLAN 작업 13~14에서 이 아래에 채운다.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="mx-auto w-full max-w-md px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold">충전콕</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          고속도로 휴게소 충전 안내
        </p>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4">
        <p className="text-sm text-zinc-500">
          곧 이곳에서 충전할 휴게소를 찾아 드려요.
        </p>
      </main>
    </div>
  );
}
