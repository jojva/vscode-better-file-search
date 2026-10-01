import * as path from 'node:path';
import * as vscode from 'vscode';
import { RankableFile } from './ranking.js';

/** A workspace file, with the label and description Quick Open would show for it. */
export interface IndexedFile extends RankableFile {
	readonly uri: vscode.Uri;
}

/** Settings that change which files Quick Open lists. */
const FILE_LIST_SETTINGS = [
	'files.exclude',
	'search.exclude',
	'search.useIgnoreFiles',
	'search.useParentIgnoreFiles',
	'search.useGlobalIgnoreFiles',
	'search.followSymlinks',
];

/** Waits for a burst of file events, like a branch switch, to end before listing files again. */
const RESCAN_DELAY_MS = 500;

/**
 * Keeps the list of workspace files in memory, so that each keystroke only ranks files.
 * The list follows the same exclude and ignore settings as Quick Open.
 */
export class FileIndex implements vscode.Disposable {
	private files: readonly IndexedFile[] = [];
	private uris = new Set<string>();
	private scan: Promise<readonly IndexedFile[]> | undefined;
	private hasScanned = false;
	private stale = true;
	private generation = 0;
	private rescanTimer: NodeJS.Timeout | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly log: vscode.LogOutputChannel) {
		const files = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
		const ignoreFiles = vscode.workspace.createFileSystemWatcher('**/.gitignore', true, false, true);
		this.disposables.push(
			files,
			ignoreFiles,
			files.onDidCreate(() => this.markStale()),
			files.onDidDelete(() => this.markStale()),
			ignoreFiles.onDidChange(() => this.markStale()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.markStale()),
			vscode.workspace.onDidChangeConfiguration(e => {
				if (FILE_LIST_SETTINGS.some(setting => e.affectsConfiguration(setting))) {
					this.markStale();
				}
			}),
		);
	}

	/** Whether a first scan has finished, so that `getFiles` returns without waiting. */
	get isReady(): boolean {
		return this.hasScanned;
	}

	/** Returns the files, listing them first if the list is out of date. */
	async getFiles(): Promise<readonly IndexedFile[]> {
		if (!this.stale) {
			return this.files;
		}

		this.scan ??= this.doScan().finally(() => this.scan = undefined);
		return this.scan;
	}

	/**
	 * Tells whether a workspace file is in the list. Before the first scan, every file counts as
	 * present, so that callers do not hide files they cannot check yet.
	 */
	has(uri: vscode.Uri): boolean {
		return !this.hasScanned || this.uris.has(uri.toString());
	}

	dispose(): void {
		clearTimeout(this.rescanTimer);
		vscode.Disposable.from(...this.disposables).dispose();
	}

	private markStale(): void {
		this.generation++;
		this.stale = true;

		// List the files again soon, so that the next Cmd+P does not wait for it.
		clearTimeout(this.rescanTimer);
		this.rescanTimer = setTimeout(() => {
			this.getFiles().catch(error => this.log.error('Cannot list the workspace files', error));
		}, RESCAN_DELAY_MS);
	}

	private async doScan(): Promise<readonly IndexedFile[]> {
		const generation = this.generation;
		const start = Date.now();
		const search = vscode.workspace.getConfiguration('search');
		const useIgnoreFiles = search.get<boolean>('useIgnoreFiles', true);

		const uris = await vscode.workspace.findFiles2(['**/*'], {
			useExcludeSettings: vscode.ExcludeSettingOptions.SearchAndFilesExclude,
			useIgnoreFiles: {
				local: useIgnoreFiles,
				parent: useIgnoreFiles && search.get<boolean>('useParentIgnoreFiles', false),
				global: useIgnoreFiles && search.get<boolean>('useGlobalIgnoreFiles', false),
			},
			followSymlinks: search.get<boolean>('followSymlinks', true),
		});

		const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
		this.files = uris.map(uri => toIndexedFile(uri, multiRoot));
		this.uris = new Set(uris.map(uri => uri.toString()));
		this.hasScanned = true;

		// A file event during the scan means the list may already be out of date.
		if (generation === this.generation) {
			this.stale = false;
		}

		this.log.info(`Listed ${this.files.length} files in ${Date.now() - start} ms`);
		return this.files;
	}
}

/**
 * Builds the label and description Quick Open shows for a file: its name, and its folder
 * relative to the workspace. In a multi-root workspace, the folder starts with the root's name.
 */
export function toIndexedFile(uri: vscode.Uri, multiRoot: boolean): IndexedFile {
	const relativePath = vscode.workspace.asRelativePath(uri, multiRoot);
	const folder = path.posix.dirname(relativePath);
	return {
		uri,
		label: path.posix.basename(relativePath),
		description: folder === '.' ? '' : folder,
		path: uri.fsPath,
	};
}
