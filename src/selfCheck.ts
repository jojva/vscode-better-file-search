import * as vscode from 'vscode';
import { workbenchContextKeys } from './contextKeys.js';
import { hasCustomHighlightInternals } from './quickPickInternals.js';

export interface CheckResult {
	readonly name: string;
	readonly ok: boolean;
	/** Why the check failed, or which part could not be checked. */
	readonly detail?: string;
}

/** Commands outside the extension API, which a VS Code update may rename or remove. */
const WORKBENCH_COMMANDS = [
	'workbench.action.quickOpen',
	'workbench.action.quickOpenNavigateNext',
	'workbench.action.configureRuntimeArguments',
	'getContextKeyInfo',
];

/**
 * Context keys that VS Code only lists once they were used, so their absence proves nothing.
 * `inFilesPicker` appears the first time the built-in "Go to File" opens.
 */
const LAZY_CONTEXT_KEYS = new Set(['inFilesPicker']);

/**
 * Checks what the extension relies on beyond the stable API. A failure means a VS Code update
 * changed something, and part of the picker may misbehave.
 *
 * The checks cannot see what the window draws. If VS Code ignores `sortByLabel`, `matchOnLabel`
 * or `highlights`, the order or the highlights go wrong without any check failing.
 */
export async function runSelfCheck(context: vscode.ExtensionContext): Promise<CheckResult[]> {
	return [
		await checkFindFiles2(),
		checkPickerInternals(),
		await checkCommands(),
		await checkContextKeys(workbenchContextKeys(context.extension.packageJSON)),
	];
}

async function checkFindFiles2(): Promise<CheckResult> {
	const name = 'Proposed API findFiles2';
	try {
		await vscode.workspace.findFiles2(['**/*'], { maxResults: 1 });
		return { name, ok: true };
	} catch (error) {
		return { name, ok: false, detail: String(error) };
	}
}

function checkPickerInternals(): CheckResult {
	const picker = vscode.window.createQuickPick();
	try {
		const missing: string[] = [];
		if (!('sortByLabel' in picker)) {
			missing.push('QuickPick.sortByLabel, so files are re-sorted by name');
		}
		if (!hasCustomHighlightInternals(picker)) {
			missing.push('the internal QuickPick.update, so VS Code draws its own highlights');
		}
		return { name: 'Picker internals', ok: missing.length === 0, detail: missing.length > 0 ? `Missing ${missing.join(' and ')}` : undefined };
	} finally {
		picker.dispose();
	}
}

async function checkCommands(): Promise<CheckResult> {
	const all = new Set(await vscode.commands.getCommands(false));
	const missing = WORKBENCH_COMMANDS.filter(command => !all.has(command));
	return { name: 'Workbench commands', ok: missing.length === 0, detail: missing.length > 0 ? `Missing ${missing.join(', ')}` : undefined };
}

async function checkContextKeys(keys: string[]): Promise<CheckResult> {
	const name = 'Keybinding context keys';
	let info: unknown;
	try {
		info = await vscode.commands.executeCommand('getContextKeyInfo');
	} catch (error) {
		return { name, ok: false, detail: `Cannot list context keys: ${String(error)}` };
	}
	if (!Array.isArray(info)) {
		return { name, ok: false, detail: 'Cannot list context keys: getContextKeyInfo returned no list' };
	}

	const known = new Set(info.map(entry => (entry as { key?: unknown } | undefined)?.key));
	const checked = keys.filter(key => !LAZY_CONTEXT_KEYS.has(key));
	const missing = checked.filter(key => !known.has(key));
	const skipped = keys.filter(key => LAZY_CONTEXT_KEYS.has(key));
	const skippedNote = skipped.length > 0 ? `Not checkable: ${skipped.join(', ')}` : undefined;
	if (missing.length > 0) {
		return { name, ok: false, detail: [`Missing ${missing.join(', ')}`, skippedNote].filter(Boolean).join('. ') };
	}
	return { name, ok: true, detail: skippedNote };
}
