import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type * as vscode from 'vscode';
import { enableCustomHighlights, hasCustomHighlightInternals } from '../src/quickPickInternals.js';

/**
 * Mimics the extension host's QuickPick in VS Code 1.140: property changes and items go through
 * `update`, and each sent item carries its index as `handle`.
 */
class FakePicker {
	readonly sent: Record<string, unknown>[] = [];
	matchOnDescription = true;
	matchOnDetail = true;
	sortByLabel = true;

	update(properties: Record<string, unknown>): void {
		this.sent.push(properties);
	}

	set items(items: vscode.QuickPickItem[]) {
		this.update({
			items: items.map((item, handle) => item.kind === -1 ? { type: 'separator', label: item.label } : { handle, label: item.label }),
		});
	}
}

function asPicker(fake: object): vscode.QuickPick<vscode.QuickPickItem> {
	return fake as unknown as vscode.QuickPick<vscode.QuickPickItem>;
}

describe('enableCustomHighlights', () => {
	test('turns off the window\'s own matching', () => {
		const fake = new FakePicker();
		assert.ok(enableCustomHighlights(asPicker(fake)));
		assert.deepEqual(fake.sent, [{ matchOnLabel: false }]);
		assert.equal(fake.matchOnDescription, false);
		assert.equal(fake.matchOnDetail, false);
		assert.equal(fake.sortByLabel, false);
	});

	test('adds the highlights to the sent items by index', () => {
		const fake = new FakePicker();
		const setHighlights = enableCustomHighlights(asPicker(fake));
		const versionMatch = { label: [{ start: 0, end: 4 }] };
		setHighlights?.([undefined, versionMatch]);
		fake.items = [{ label: 'recently opened', kind: -1 }, { label: 'Version.h' }];

		assert.deepEqual(fake.sent.at(-1), {
			items: [{ type: 'separator', label: 'recently opened' }, { handle: 1, label: 'Version.h', highlights: versionMatch }],
		});
	});

	test('does nothing without the internal update method', () => {
		const fake = { matchOnDescription: true };
		assert.equal(hasCustomHighlightInternals(fake), false);
		assert.equal(enableCustomHighlights(asPicker(fake)), undefined);
		assert.equal(fake.matchOnDescription, true);
	});

	test('does nothing when update cannot be replaced', () => {
		const fake = Object.freeze(new FakePicker());
		assert.equal(enableCustomHighlights(asPicker(fake)), undefined);
		assert.deepEqual(fake.sent, []);
	});
});
