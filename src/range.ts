/*---------------------------------------------------------------------------------------------
 *  Copied from microsoft/vscode src/vs/workbench/contrib/search/common/search.ts at commit
 *  07f806f999227108933c2e30515b26eecc1fda74. Copyright (c) Microsoft Corporation. MIT License,
 *  see src/vendor/vscode/LICENSE.txt.
 *--------------------------------------------------------------------------------------------*/

import { isNumber } from './vendor/vscode/vs/base/common/types.js';

/** A 1-based range, as Quick Open parses it from `file:line:column`. */
export interface IRange {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
}

export interface IFilterAndRange {
	filter: string;
	range: IRange;
}

const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?(?:-(\d*)(?:[#:,](\d*))?)?\)?:?\s*$/;

export function extractRangeFromFilter(filter: string, unless?: string[]): IFilterAndRange | undefined {
	// Ignore when the unless character not the first character or is before the line colon pattern
	if (!filter || unless?.some(value => {
		const unlessCharPos = filter.indexOf(value);
		return unlessCharPos === 0 || unlessCharPos > 0 && !LINE_COLON_PATTERN.test(filter.substring(unlessCharPos + 1));
	})) {
		return undefined;
	}

	let range: IRange | undefined = undefined;

	// Find Line/Column number from search value using RegExp
	const patternMatch = LINE_COLON_PATTERN.exec(filter);

	if (patternMatch) {
		const startLineNumber = parseInt(patternMatch[1] ?? '', 10);

		// Line Number
		if (isNumber(startLineNumber)) {
			range = {
				startLineNumber: startLineNumber,
				startColumn: 1,
				endLineNumber: startLineNumber,
				endColumn: 1
			};

			// Column Number
			const startColumn = parseInt(patternMatch[2] ?? '', 10);
			if (isNumber(startColumn)) {
				range = {
					startLineNumber: range.startLineNumber,
					startColumn: startColumn,
					endLineNumber: range.endLineNumber,
					endColumn: startColumn
				};
			}

			// End Line Number (range selection, e.g. "20-40")
			const endLineNumber = parseInt(patternMatch[3] ?? '', 10);
			if (isNumber(endLineNumber)) {

				// End Column Number (e.g. "20:3-40:5"), defaults to the start of the end line
				const endColumn = parseInt(patternMatch[4] ?? '', 10);
				range = {
					startLineNumber: range.startLineNumber,
					startColumn: range.startColumn,
					endLineNumber: endLineNumber,
					endColumn: isNumber(endColumn) ? endColumn : 1
				};
			}
		}

		// User has typed "something:" or "something#" without a line number, in this case treat as start of file
		else if (patternMatch[1] === '') {
			range = {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 1
			};
		}
	}

	if (patternMatch && range) {
		return {
			filter: filter.substr(0, patternMatch.index), // clear range suffix from search value
			range
		};
	}

	return undefined;
}
