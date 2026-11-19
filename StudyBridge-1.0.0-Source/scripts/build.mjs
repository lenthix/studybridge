import { build } from 'esbuild';
import { build as vite } from 'vite';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.ts'],outfile:'dist/main.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],target:'node22'});
await build({entryPoints:['src/preload.ts'],outfile:'dist/preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron']});
await vite({root:'src/ui',base:'./',build:{outDir:'../../dist/ui',emptyOutDir:true}});
await build({entryPoints:['relay/server.ts'],outfile:'dist/relay.cjs',bundle:true,platform:'node',format:'cjs',target:'node22'});
