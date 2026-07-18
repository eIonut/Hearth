import { spawn } from 'child_process';

// Open a URL through the operating system instead of `window.open()`, which
// browsers commonly limit to one tab per click. Arguments are passed directly
// to the platform launcher, never through a shell.
export function openInBrowser(url) {
  let command;
  let args;
  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}
