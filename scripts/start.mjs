import { spawn } from 'node:child_process';

// Продакшен-запуск: NODE_ENV=production выставляется ДО чтения окружения сервером.
const child = spawn('npx', ['tsx', 'src/server/index.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});

child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
