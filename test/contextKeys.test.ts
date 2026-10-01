import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { workbenchContextKeys } from '../src/contextKeys.js';

test('lists the VS Code context keys of the keybindings', () => {
	const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
	assert.deepEqual(workbenchContextKeys(packageJson), ['cursorAtEndOfQuickInputBox', 'inFilesPicker', 'inQuickOpen', 'inputFocus']);
});

test('skips quoted values and constants', () => {
	const packageJson = { contributes: { keybindings: [{ when: "quickInputType == 'quickPick' && !false" }, {}] } };
	assert.deepEqual(workbenchContextKeys(packageJson), ['quickInputType']);
});
