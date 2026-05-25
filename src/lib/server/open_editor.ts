import { spawn } from 'node:child_process';
import { platform } from 'node:process';

export function openInDefaultEditor(filePath: string): void {
  const opts = { detached: true, stdio: 'ignore' as const };
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', filePath], { ...opts, shell: false }).unref();
  } else if (platform === 'darwin') {
    spawn('open', [filePath], opts).unref();
  } else {
    spawn('xdg-open', [filePath], opts).unref();
  }
}
