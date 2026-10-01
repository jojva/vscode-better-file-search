import * as vscode from 'vscode';
import { FileIndex } from './fileIndex.js';
import { RecentlyOpened } from './history.js';
import { FilePicker } from './picker.js';

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
	);

	// List the files now, so that the first Cmd+P does not wait for it.
	index.getFiles().catch(reportFileListError);
}

export function deactivate(): void { }
