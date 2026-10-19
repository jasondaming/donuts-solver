// Starts the solver service and the Vite dev server together; Ctrl+C stops both.
// Runs node directly (not npm.cmd) so Windows doesn't ask "Terminate batch job?".
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const children = [
  spawn(process.execPath, ['--experimental-strip-types', 'server/server.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--open', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
];

for (const child of children) {
  child.on('exit', code => {
    for (const other of children) {
      if (other.exitCode === null && other.signalCode === null) other.kill();
    }
    process.exitCode ||= code ?? 0;
  });
}

// Each child receives Ctrl+C from the terminal itself and shuts down cleanly.
process.on('SIGINT', () => {});
