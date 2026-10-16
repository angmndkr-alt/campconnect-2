import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','server/tsconfig.json'],{cwd:root,stdio:'inherit'});if(build.status)process.exit(build.status);
const children=['server/dist/index.js','node_modules/vite/bin/vite.js'].map(file=>spawn(process.execPath,[file],{cwd:root,stdio:'inherit'}));
const stop=()=>{children.forEach(p=>p.kill());};process.on('SIGINT',stop);process.on('SIGTERM',stop);children.forEach(p=>p.on('exit',()=>{stop();process.exitCode=1;}));
