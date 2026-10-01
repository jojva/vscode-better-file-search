import * as vscode from 'vscode';
import { FileIndex } from './fileIndex.js';
import { RecentlyOpened } from './history.js';
import { FilePicker } from './picker.js';
import { CheckResult, runSelfCheck } from './selfCheck.js';

/** The VS Code version the self-check last ran on, and whether it passed. */
const SELF_CHECK_STATE_KEY = 'selfCheck';

interface SelfCheckState {
	readonly version: string;
	readonly ok: boolean;
}

export function activate(context: vscode.ExtensionContext): void {
	const log = vscode.window.createOutputChannel('Better File Search', { log: true });
	const index = new FileIndex(log);
	const history = new RecentlyOpened(context.workspaceState);

	let reportedFileListError = false;
	const reportFileListError = (error: unknown) => {
		log.error('Cannot list the workspace files', error);
		if (reportedFileListError) {
			return;
		}
		reportedFileListError = true;

		// findFiles2 is a proposed API. VS Code only allows it for extensions listed in argv.json.
		const id = context.extension.id;
		const openArgv = 'Open argv.json';
		void vscode.window.showErrorMessage(
			`Better File Search cannot list files, so Cmd+P uses the built-in Quick Open. Add "enable-proposed-api": ["${id}"] to argv.json, then restart VS Code.`,
			openArgv,
		).then(choice => {
			if (choice === openArgv) {
				void vscode.commands.executeCommand('workbench.action.configureRuntimeArguments');
			}
		});
	};

	const picker = new FilePicker(index, history, reportFileListError);

	context.subscriptions.push(
		log,
		index,
		history,
		vscode.commands.registerCommand('betterFileSearch.show', () => picker.show()),
		vscode.commands.registerCommand('betterFileSearch.acceptInBackground', () => picker.accept('background')),
		vscode.commands.registerCommand('betterFileSearch.alternativeAccept', () => picker.accept('alternative')),
		vscode.commands.registerCommand('betterFileSearch.openToSide', () => picker.accept('side')),
		vscode.commands.registerCommand('betterFileSearch.selfCheck', () => selfCheck(context, log, { always: true })),
	);

	// List the files now, so that the first Cmd+P does not wait for it.
	index.getFiles().catch(reportFileListError);

	void selfCheck(context, log, { always: false });
}

export function deactivate(): void { }

/**
 * Runs the self-check and reports failures in a notification.
 * @param options.always Run and report even if this VS Code version was already checked. The
 * automatic check runs once per version, and warns once about a version that fails.
 */
async function selfCheck(context: vscode.ExtensionContext, log: vscode.LogOutputChannel, options: { always: boolean }): Promise<void> {
	const last = context.globalState.get<SelfCheckState>(SELF_CHECK_STATE_KEY);
	if (!options.always && last?.version === vscode.version) {
		return;
	}

	let results: CheckResult[];
	try {
		results = await runSelfCheck(context);
	} catch (error) {
		results = [{ name: 'Self-check', ok: false, detail: String(error) }];
	}

	const failed = results.filter(result => !result.ok);
	log.info(`Self-check on VS Code ${vscode.version}: ${failed.length === 0 ? 'passed' : `${failed.length} of ${results.length} checks failed`}`);
	for (const result of results) {
		const line = `  ${result.ok ? 'passed' : 'FAILED'}  ${result.name}${result.detail ? `: ${result.detail}` : ''}`;
		if (result.ok) {
			log.info(line);
		} else {
			log.warn(line);
		}
	}
	await context.globalState.update(SELF_CHECK_STATE_KEY, { version: vscode.version, ok: failed.length === 0 } satisfies SelfCheckState);

	const showLog = 'Show Log';
	if (failed.length > 0) {
		const choice = await vscode.window.showWarningMessage(
			`Better File Search: ${failed.map(result => result.name).join(', ')} failed on VS Code ${vscode.version}. Cmd+P may not work as expected.`,
			showLog,
		);
		if (choice === showLog) {
			log.show();
		}
	} else if (options.always) {
		const choice = await vscode.window.showInformationMessage(
			`Better File Search: all ${results.length} checks passed on VS Code ${vscode.version}. Wrong highlights or ordering cannot be detected, so check them by eye.`,
			showLog,
		);
		if (choice === showLog) {
			log.show();
		}
	}
}
