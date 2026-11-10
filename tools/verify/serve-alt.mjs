// Starts the server on a second port with a throwaway save directory, for
// testing while another session already holds 8790. Test rooms never reach
// the real save file.  node tools/verify/serve-alt.mjs [port=8793]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.argv[2] ?? '8793';
const data = path.join(os.tmpdir(), `bge-alt-${port}`);
fs.mkdirSync(data, { recursive: true });
const child = spawn('npm run dev', { cwd: repo, shell: true, stdio: 'inherit', env: { ...process.env, PORT: port, BGE_DATA_DIR: data } });
child.on('exit', (code) => process.exit(code ?? 0));
