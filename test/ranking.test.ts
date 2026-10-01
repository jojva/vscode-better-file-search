import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RankableFile, rankFiles } from '../src/ranking.js';
import { prepareQuery, scoreFuzzy } from '../src/vendor/vscode/vs/base/common/fuzzyScorer.js';

const PATHS = [
	'src/rules/include/rules/Version.h',
	'src/rules/src/Version.cpp',
	'src/rules/src/RuleValueParserTest.cpp',
	'tests/e2e/12-delete-rule-via-replica-sync.res',
	'src/trie/include/trie/TrieVersion.h',
	'src/schedule/RecurringVisitTimeRange.h',
	'src/schedule/RecurringVisitTimeRange.cpp',
	'src/metrics/ServerMetrics.h',
	'src/metrics/ServerMetricsTest.cpp',
	'src/json/JSONWalker.h',
	'src/json/JsonWriter.h',
	'tools/dumpIndex/DumpIndex.h',
	'tools/dumpIndex/DumpIndex.cpp',
	'tools/dumpIndexBlob/DumpIndexBlob.h',
	'CMakeLists.txt',
	'src/CMakeLists.txt',
];

const FILES: RankableFile[] = PATHS.map(path => {
	const slash = path.lastIndexOf('/');
	return { label: path.slice(slash + 1), description: slash < 0 ? '' : path.slice(0, slash), path: `/workspace/${path}` };
});

function rank(query: string): string[] {
	return rankFiles(FILES, query, 512).map(file => file.path.slice('/workspace/'.length));
}

/** Score of the query on a file name, with or without the word-start rule. */
function labelScore(label: string, query: string, wordStartsOnly: boolean): number {
	const prepared = prepareQuery(query);
	return scoreFuzzy(label, prepared.normalized, prepared.normalizedLowercase, true, wordStartsOnly)[0];
}

describe('scattered file name matches', () => {
	// These names contain the letters of the query in order, but mostly in the middle of words.
	// VS Code ranks such a name above every path match, which is the bug this extension fixes.
	const scattered: Array<[label: string, query: string]> = [
		['RuleValueParserTest.cpp', 'rulevers'],
		['12-delete-rule-via-replica-sync.res', 'rulevers'],
		['ServerMetrics.h', 'rvtr'],
	];

	for (const [label, query] of scattered) {
		test(`"${query}" matches "${label}" only without the word-start rule`, () => {
			assert.ok(labelScore(label, query, false) > 0);
			assert.equal(labelScore(label, query, true), 0);
		});
	}

	test('rank below a clean path match', () => {
		const results = rank('rulevers');
		assert.deepEqual(results.slice(0, 2), ['src/rules/include/rules/Version.h', 'src/rules/src/Version.cpp']);
	});

	test('still show up in the results', () => {
		const results = rank('rulevers');
		assert.ok(results.includes('src/rules/src/RuleValueParserTest.cpp'));
		assert.ok(results.includes('tests/e2e/12-delete-rule-via-replica-sync.res'));
	});

	test('rank below a clean match on word starts', () => {
		assert.deepEqual(rank('rvtr').slice(0, 2), ['src/schedule/RecurringVisitTimeRange.h', 'src/schedule/RecurringVisitTimeRange.cpp']);
	});

	test('do not win when the query has several words', () => {
		assert.equal(rank('rule vers')[0], 'src/rules/include/rules/Version.h');
	});
});

describe('word starts', () => {
	const clean: Array<[label: string, query: string]> = [
		['RuleVersion.h', 'rv'],
		['JSONWalker.h', 'jw'],
		['dump-index.cpp', 'di'],
		['dump_index.cpp', 'di'],
		['Version.h', 'vh'],
	];

	for (const [label, query] of clean) {
		test(`"${query}" matches "${label}" with the word-start rule`, () => {
			assert.ok(labelScore(label, query, true) > 0);
		});
	}

	test('letters inside an acronym are not word starts', () => {
		assert.equal(labelScore('JSONWalker.h', 'jo', true), 0);
	});
});

describe('ordinary queries', () => {
	test('a file name prefix ranks first', () => {
		assert.deepEqual(rank('version').slice(0, 2), ['src/rules/include/rules/Version.h', 'src/rules/src/Version.cpp']);
	});

	test('an abbreviation still finds the file', () => {
		assert.equal(rank('dumpidx')[0], 'tools/dumpIndex/DumpIndex.h');
	});

	test('a shorter path wins a tie', () => {
		assert.equal(rank('cmakelists')[0], 'CMakeLists.txt');
	});

	test('an exact path ranks first', () => {
		assert.equal(rankFiles(FILES, '/workspace/src/rules/src/Version.cpp', 512)[0].label, 'Version.cpp');
	});

	test('an empty query matches nothing', () => {
		assert.deepEqual(rank(''), []);
	});
});
