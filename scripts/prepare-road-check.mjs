import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const source = process.cwd(), directory = resolve(process.env.ROAD_REVIEW_DIR || '/tmp/egg-road-fix');
if (!directory.startsWith('/tmp/')) throw new Error('Use an isolated directory under /tmp');
const site = join(directory, 'site');
await mkdir(site, { recursive: true });
for (const path of ['src', 'public', 'scripts']) await cp(join(source, path), join(site, path), { recursive: true });
for (const path of ['package.json', 'tsconfig.json', 'tsconfig.games.json', 'astro.config.mjs']) await cp(join(source, path), join(site, path));
try { await symlink(join(source, 'node_modules'), join(site, 'node_modules'), 'dir'); } catch (error) { if (error.code !== 'EEXIST') throw error; }
const config = join(site, 'astro.config.mjs');
await writeFile(config, (await readFile(config, 'utf8')).replace('export default defineConfig({', `export default defineConfig({\n  cacheDir: ${JSON.stringify(join(directory, 'astro-cache'))},`));
const engine = join(site, 'src/features/EggRoad/engine.ts');
await writeFile(engine, (await readFile(engine, 'utf8')).replace('    return instance;', '    (window as any).__road = instance;\n    return instance;'));
console.log(`Prepared ${site}; .env, databases and private assets were not copied.`);
