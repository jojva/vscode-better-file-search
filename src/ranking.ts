import { top } from './vendor/vscode/vs/base/common/arrays.js';
import { compareItemsByFuzzyScore, FuzzyScorerCache, IItemAccessor, prepareQuery, scoreItemFuzzy } from './vendor/vscode/vs/base/common/fuzzyScorer.js';

/** A file as the scorer sees it. */
export interface RankableFile {
	/** File name, such as `Version.h`. */
	readonly label: string;
	/** Folder of the file relative to the workspace, such as `core/rules`. Empty for files at the root. */
	readonly description: string;
	/** Absolute file system path. The scorer uses it to rank an exact path match first. */
	readonly path: string;
}

/** Same item shape as Quick Open's `QuickPickItemScorerAccessor`. */
const accessor: IItemAccessor<RankableFile> = {
	getItemLabel: file => file.label,
	getItemDescription: file => file.description || undefined,
	getItemPath: file => file.path,
};

/**
 * Ranks files against a query the way Quick Open does, with the vendored scorer.
 * @param files Candidate files.
 * @param filter The query, without any `:line` suffix.
 * @param maxResults Maximum number of files to return.
 * @param cache Score cache. Reuse it across the keystrokes of one picker session.
 * @returns The matching files, best first.
 */
export function rankFiles<T extends RankableFile>(files: readonly T[], filter: string, maxResults: number, cache: FuzzyScorerCache = Object.create(null)): T[] {
	const query = prepareQuery(filter);
	if (!query.normalized) {
		return [];
	}

	const matches = files.filter(file => scoreItemFuzzy(file, query, true, accessor, cache).score > 0);
	return top(matches, (a, b) => compareItemsByFuzzyScore(a, b, query, true, accessor, cache), maxResults);
}
