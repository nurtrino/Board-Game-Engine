// Tiny local bridge for the TTS setup dump. TTS chat truncates pasted commands
// (~240 chars), so instead of pasting the dump script, the user pastes one
// short /execute that fetches the script from this server and runs it; the
// script PUTs its JSON back here and this writes golden/tts-dump.json.
//
//   node tools/tts-extract/dump-server.mjs
//   (in TTS chat)  /execute WebRequest.get("http://localhost:8799/dump.lua",function(r)if r.is_error then print(r.error)else load(r.text)()end end)
//
// Then: node tools/tts-extract/validate-dump.mjs

import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outPath = join(root, 'games', 'brass-birmingham', 'golden', 'tts-dump.json');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/dump.lua') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(readFileSync(join(here, 'tts-dump-setup.lua'), 'utf8'));
    console.log('served dump.lua to TTS');
    return;
  }
  if ((req.method === 'PUT' || req.method === 'POST') && req.url === '/result') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        JSON.parse(body); // validate before writing
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, body);
        console.log(`dump received (${body.length} bytes) -> ${outPath}`);
        console.log('now run: node tools/tts-extract/validate-dump.mjs');
        res.writeHead(200);
        res.end('ok');
      } catch (err) {
        console.error('bad dump payload:', err.message);
        res.writeHead(400);
        res.end('bad json');
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(8799, () => console.log('dump bridge on http://localhost:8799 — waiting for TTS'));
