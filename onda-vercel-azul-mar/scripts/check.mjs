import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
for (const dir of ['api','lib','public','scripts']) {
  for (const name of await readdir(path.join(root,dir))) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const file = path.join(dir,name);
    const run = spawnSync(process.execPath,['--check',file],{stdio:'pipe',encoding:'utf8'});
    if (run.status !== 0) { console.error(run.stderr); process.exit(1); }
  }
}
const config = JSON.parse(await readFile('vercel.json','utf8'));
if (config.outputDirectory !== 'public' || !config.functions?.['api/index.js']) throw new Error('Invalid Vercel configuration.');
for (const name of ['public/index.html','public/admin.html','api/index.js','package-lock.json']) await access(name);
// Cloud credentials are intentionally NOT required at build time.
console.log('OK: JavaScript syntax, public files and Vercel configuration.');
console.log('Frontend: public/. Backend: api/index.js. No runtime filesystem database.');
