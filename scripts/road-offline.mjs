import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build a closed asset graph, including lazy imports and the generation worker. */
export async function buildRoadOffline(root) {
  const found = new Map();
  async function visit(pathname) {
    if (found.has(pathname)) return;
    const disk = join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
    if (!resolve(disk).startsWith(resolve(root) + '/')) throw new Error('Invalid offline asset');
    try { if (!(await stat(disk)).isFile()) throw new Error(`Missing offline asset: ${pathname}`); }
    catch (error) {
      // WASM bindings contain virtual module names as strings. They are not
      // emitted assets; actual hashed Vite imports must always exist.
      if (error.code === 'ENOENT' && !pathname.endsWith('/') && !/\.[\w-]{6,}\.(js|css|wasm)$/.test(pathname)) return;
      throw error;
    }
    const body = await readFile(disk); found.set(pathname, body);
    if (!/\.(js|css|html)$/.test(disk)) return;
    const matches = body.toString().matchAll(/["'`(]((?:\.{0,2}\/|_astro\/)[^"'`()<>\s]+\.(?:js|css|wasm|woff2?|png|svg|webp|ico))["'`)]/g);
    for (const [, raw] of matches) {
      const path = new URL(raw.startsWith('_astro/') ? '/' + raw : raw, 'https://offline.invalid' + pathname).pathname;
      if (!/^\/(?:_astro\/|fonts\/|egg-road-|favicon)/.test(path)) continue;
      await visit(path);
    }
  }
  await visit('/ru/play/'); await visit('/en/play/');
  for (const [path, body] of [...found]) if (/\/_astro\/track\.worker[-.].*\.js$/.test(path)) {
    for (const lang of ['ru', 'en']) {
      const scoped = `/${lang}/play/${basename(path)}`;
      await writeFile(join(root, scoped), body); found.set(scoped, body);
    }
  }
  const template = await readFile(new URL('./road-sw-template.js', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(template);
  for (const [path, body] of [...found].sort()) hash.update(path).update(body);
  const version = hash.digest('hex').slice(0, 16);
  const assets = [...found.keys()].sort();
  await writeFile(join(root, 'egg-road-sw.js'), `const BUILD = ${JSON.stringify(version)};\nconst ASSETS = ${JSON.stringify(assets)};\n${template}`);
  return { version, assets: assets.length, bytes: [...found.values()].reduce((sum, body) => sum + body.length, 0) };
}

/** @returns {import('astro').AstroIntegration} */
export function roadOffline() {
  let client;
  return { name: 'egg-road-offline', hooks: {
    'astro:config:done': ({ config }) => { client = config.build.client; },
    'astro:build:done': async ({ logger }) => {
      const result = await buildRoadOffline(fileURLToPath(client));
      logger.info(`Egg Road offline: ${result.assets} assets, ${(result.bytes / 1024 / 1024).toFixed(2)} MiB`);
    },
  } };
}
