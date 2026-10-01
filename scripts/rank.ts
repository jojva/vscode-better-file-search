// Ranks a list of files for a query, outside VS Code. Useful to check the ranking on a real repo:
//
//   cd some/repo && rg --files --hidden -g '!.git' > /tmp/files.txt
//   npm run test && node out/scripts/rank.mjs /tmp/files.txt rulevers 20

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { RankableFile, rankFiles } from '../src/ranking.js';

const [listFile, query, count = '20'] = process.argv.slice(2);
if (!listFile || query === undefined) {
	console.error('Usage: node out/scripts/rank.mjs <file-list> <query> [count]');
	process.exit(1);
}

const files: RankableFile[] = readFileSync(listFile, 'utf8').split('\n').filter(Boolean).map(file => {
	const folder = path.posix.dirname(file);
	return { label: path.posix.basename(file), description: folder === '.' ? '' : folder, path: file };
});

const start = performance.now();
const results = rankFiles(files, query, Number(count));
const elapsed = performance.now() - start;

results.forEach((file, i) => console.log(`${String(i + 1).padStart(3)}  ${file.path}`));
console.log(`\n${files.length} files ranked in ${elapsed.toFixed(1)} ms`);
