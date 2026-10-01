import { extractRangeFromFilter, IRange } from './range.js';

/**
 * Prefixes that switch Quick Open to another provider: commands, symbols in the editor, go to line,
 * workspace symbols, help, and text search.
 */
const HANDOFF_PREFIXES = ['>', '@', ':', '#', '?', '%'];

const SYMBOL_PREFIX = '@';

/** What the picker should do with the text typed so far. */
export type ParsedInput =
	/** Give the whole value to the built-in Quick Open, which owns that prefix. */
	| { readonly kind: 'handoff'; readonly value: string }
	/** Rank files. */
	| {
		readonly kind: 'files';
		/** The query without the `:line` suffix. */
		readonly filter: string;
		/** Where to put the cursor when the file opens, from a `:line:column` suffix. */
		readonly range?: IRange;
		/** Number of `@`-separated segments. More than one means the user may want symbols. */
		readonly symbolSegments: number;
		/** Text after the last `@`, used to filter the symbols of the selected file. */
		readonly symbolFilter: string;
	};

/**
 * Parses the picker value with the same rules as Quick Open's "Go to File".
 * @param value The text in the picker.
 * @returns What to do with it.
 */
export function parseInput(value: string): ParsedInput {
	if (HANDOFF_PREFIXES.some(prefix => value.startsWith(prefix))) {
		return { kind: 'handoff', value };
	}

	const segments = value.split(SYMBOL_PREFIX);
	const filterAndRange = extractRangeFromFilter(value, [SYMBOL_PREFIX]);
	return {
		kind: 'files',
		filter: filterAndRange?.filter ?? value,
		range: filterAndRange?.range,
		symbolSegments: segments.length,
		symbolFilter: segments[segments.length - 1].trim(),
	};
}

/**
 * Tells whether the value asks for the symbols of the selected file, like `Version.h@build`.
 * A file whose name or folder contains `@` needs a second `@`, as in Quick Open.
 * @param input The parsed value.
 * @param selectedPath Path of the selected file, relative to the workspace.
 */
export function wantsSymbols(input: ParsedInput, selectedPath: string): boolean {
	if (input.kind !== 'files' || input.symbolSegments < 2) {
		return false;
	}

	return input.symbolSegments >= (selectedPath.includes(SYMBOL_PREFIX) ? 3 : 2);
}
