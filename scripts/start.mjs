import { spawn } from "node:child_process";
import { startPolling, errorCode } from "./kladka-poller.mjs";

// Точка входа контейнера: preview-сервер Astro плюс поллер модерации Книги
// Кладки. Поллер держим в этом процессе, а сервер запускаем дочерним — сервер
// главный, без него контейнеру нечего делать.

const server = spawn("npm", ["run", "preview"], { stdio: "inherit" });
const polling = new AbortController();
let pollerFailed = false;

server.on("exit", (code, signal) => {
  polling.abort();
  // restart: unless-stopped поднимет контейнер заново.
  process.exit(pollerFailed || signal ? 1 : (code ?? 0));
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    polling.abort();
    server.kill(signal);
  });
}

startPolling({ signal: polling.signal }).catch((err) => {
  pollerFailed = true;
  console.error(`[kladka-poller] остановлен: ${errorCode(err)}`);
  server.kill("SIGTERM");
});
