// 연습 모드로 개발 서버를 띄운다 (`npm run dev:sample`)
// 공공데이터가 멈췄을 때도 화면 흐름을 확인할 수 있게 가짜 충전기 정보를 쓰도록 표시만 켠다
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, CHARGER_SAMPLE_DATA: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
