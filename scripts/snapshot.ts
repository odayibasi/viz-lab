// Statik GitHub Pages sürümü için veri anlık görüntüsü üretir: apps/web/public/data/github.json
// GITHUB_TOKEN + GITHUB_LOGIN varsa gerçek veri, yoksa örnek veri yazar.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchGitHubData, makeSampleData } from '@viz/core';

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_LOGIN ?? process.env.GITHUB_REPOSITORY_OWNER;

const data = token && login ? await fetchGitHubData(login, token) : makeSampleData();
const out = resolve(import.meta.dirname, '../apps/web/public/data/github.json');
writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`✔ ${data.sample ? 'örnek' : '@' + data.login} · ${data.contributions.length} gün, ${data.repos.length} repo → ${out}`);
