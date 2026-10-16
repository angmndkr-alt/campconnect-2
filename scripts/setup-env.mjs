import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../server/.env', import.meta.url));
if (existsSync(target)) {
  console.log('Keeping existing server/.env. Edit DATABASE_URL there if needed.');
} else {
  const example = readFileSync(new URL('../server/.env.example', import.meta.url), 'utf8');
  writeFileSync(target, example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`), { mode: 0o600, flag: 'wx' });
  console.log('Created server/.env with a new authentication secret.');
}
