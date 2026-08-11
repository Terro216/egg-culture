import { spawn } from "node:child_process";
import { startPolling } from "./kladka-poller.mjs";

// Точка входа контейнера: preview-сервер Astro плюс поллер модерации Книги
// Кладки. Поллер держим в этом процессе, а сервер запускаем дочерним — сервер
// главный, без него контейнеру нечего делать.

const server = spawn("npm", ["run", "preview"], { stdio: "inherit" });

server.on("exit", (code, signal) => {
  // restart: unless-stopped поднимет контейнер заново.
  process.exit(signal ? 1 : (code ?? 0));
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}

startPolling().catch((err) => {
  console.error("[kladka-poller] остановлен:", err);
});
