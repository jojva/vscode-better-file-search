import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseInput, wantsSymbols } from '../src/input.js';

describe('parseInput', () => {
	for (const value of ['>reload', '@build', ':42', '#Version', '?', '%todo']) {
		test(`"${value}" goes to the built-in Quick Open`, () => {
			assert.deepEqual(parseInput(value), { kind: 'handoff', value });
		});
	}

	test('a plain query ranks files', () => {
		const input = parseInput('rulevers');
		assert.equal(input.kind, 'files');
		assert.equal(input.kind === 'files' && input.filter, 'rulevers');
		assert.equal(input.kind === 'files' && input.range, undefined);
	});

	const ranges: Array<[value: string, line: number, column: number]> = [
		['Version.h:42', 42, 1],
		['Version.h:42:7', 42, 7],
		['Version.h#42', 42, 1],
		['Version.h(42,7)', 42, 7],
		['Version.h:', 1, 1],
	];

	for (const [value, line, column] of ranges) {
		test(`"${value}" opens line ${line}, column ${column}`, () => {
			const input = parseInput(value);
			assert.equal(input.kind, 'files');
			if (input.kind === 'files') {
				assert.equal(input.filter, 'Version.h');
				assert.equal(input.range?.startLineNumber, line);
				assert.equal(input.range?.startColumn, column);
			}
		});
	}

	test('a file name with @ is ranked as typed', () => {
		const input = parseInput('icon@2x');
		assert.equal(input.kind === 'files' && input.filter, 'icon@2x');
	});
});

describe('wantsSymbols', () => {
	test('@ after a query asks for the symbols of the selected file', () => {
		assert.ok(wantsSymbols(parseInput('Version.h@build'), 'src/rules/Version.h'));
	});

	test('the symbol filter is the text after the last @', () => {
		const input = parseInput('Version.h@ build ');
		assert.equal(input.kind === 'files' && input.symbolFilter, 'build');
	});

	test('a selected file with @ in its path needs a second @', () => {
		assert.ok(!wantsSymbols(parseInput('icon@2x'), 'assets/icon@2x.png'));
		assert.ok(wantsSymbols(parseInput('icon@2x@'), 'assets/icon@2x.png'));
	});

	test('a query without @ does not ask for symbols', () => {
		assert.ok(!wantsSymbols(parseInput('Version.h'), 'src/rules/Version.h'));
	});
});
