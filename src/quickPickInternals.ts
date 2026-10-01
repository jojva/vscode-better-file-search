import type * as vscode from 'vscode';
import type { IMatch } from './vendor/vscode/vs/base/common/filters.js';

/** Highlights of one item, in the shape of VS Code's internal `IQuickPickItemHighlights`. */
export interface ItemHighlights {
	readonly label?: IMatch[];
	readonly description?: IMatch[];
}

/**
 * Sets the highlights for the next `items` change, by index in `items`. Separators take an index
 * too, so their entry is ignored.
 */
export type SetHighlights = (highlights: readonly (ItemHighlights | undefined)[]) => void;

interface PickerInternals {
	update?: unknown;
}

interface TransferItem {
	handle?: unknown;
	highlights?: ItemHighlights;
}

/**
 * Tells whether this VS Code has the internals that `enableCustomHighlights` relies on.
 * @param picker Any picker from `window.createQuickPick`.
 */
export function hasCustomHighlightInternals(picker: object): boolean {
	return typeof (picker as PickerInternals).update === 'function';
}

/**
 * Makes the picker draw the given highlights instead of computing its own.
 *
 * No API allows this (https://github.com/microsoft/vscode/issues/83424), so this relies on how
 * VS Code 1.140 works inside:
 * - The picker object sends each property change to the window through an internal
 *   `update(properties)` method, and the window applies properties it does not know as they are.
 * - Sending `matchOnLabel: false` turns off the window's own matching. With `matchOnDescription`,
 *   `matchOnDetail` and `sortByLabel` also off, the window keeps the `highlights` of each item,
 *   as it does for the built-in pickers.
 * - Setting `items` sends them through `update` too, each with its index as `handle`. Wrapping
 *   `update` adds `highlights` to each item on the way out.
 *
 * @param picker A picker that has not been shown yet.
 * @returns A function to call before each `items` change, or `undefined` when the internals are
 * missing. The picker then keeps its own matching and highlights.
 */
export function enableCustomHighlights<T extends vscode.QuickPickItem>(picker: vscode.QuickPick<T>): SetHighlights | undefined {
	const internals = picker as unknown as PickerInternals;
	const update = internals.update;
	if (typeof update !== 'function') {
		return undefined;
	}

	let highlights: readonly (ItemHighlights | undefined)[] = [];
	const wrapped = function (this: unknown, properties: Record<string, unknown>): unknown {
		if (Array.isArray(properties.items)) {
			for (const item of properties.items as (TransferItem | undefined)[]) {
				if (item && typeof item.handle === 'number') {
					item.highlights = highlights[item.handle];
				}
			}
		}
		return update.call(this, properties);
	};

	try {
		internals.update = wrapped;
	} catch {
		return undefined;
	}
	if (internals.update !== wrapped) {
		return undefined;
	}

	picker.matchOnDescription = false;
	picker.matchOnDetail = false;
	picker.sortByLabel = false;
	update.call(picker, { matchOnLabel: false });

	return next => {
		highlights = next;
	};
}
