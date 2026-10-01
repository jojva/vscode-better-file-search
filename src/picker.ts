import * as vscode from 'vscode';
import { FileIndex, IndexedFile } from './fileIndex.js';
import { RecentlyOpened } from './history.js';
import { parseInput, wantsSymbols } from './input.js';
import { IRange } from './range.js';
import { rankFiles } from './ranking.js';
import { FuzzyScorerCache } from './vendor/vscode/vs/base/common/fuzzyScorer.js';

/** Same cap as Quick Open. */
const MAX_RESULTS = 512;

/** True while the picker is open. The keybindings in package.json depend on it. */
const VISIBLE_CONTEXT_KEY = 'betterFileSearch.visible';

const PLACEHOLDER = 'Search files by name (append : to go to line or @ to go to symbol)';

/**
 * How to open the selected file. Each mode copies what Quick Open does for the same key.
 * - `default`: Enter.
 * - `alternative`: Cmd+Enter. Pinned, and to the side when Quick Open does not open previews.
 * - `side`: Alt+Enter, or the item's split button.
 * - `background`: Right arrow. Opens without moving the focus, and the picker stays open.
 */
export type OpenMode = 'default' | 'alternative' | 'side' | 'background';

interface FileItem extends vscode.QuickPickItem {
	readonly uri: vscode.Uri;
}

/** A file, or the "recently opened" separator. */
type PickerItem = FileItem | vscode.QuickPickItem;

interface Session {
	readonly picker: vscode.QuickPick<PickerItem>;
	readonly openToSideButton: vscode.QuickInputButton;
	/** Score cache for this session's keystrokes, as in Quick Open. */
	readonly cache: FuzzyScorerCache;
	/** Cursor position from a `:line:column` suffix. */
	range: IRange | undefined;
	/** The file selected before `@` was typed. `@` shows the symbols of this file. */
	lastFile: FileItem | undefined;
	/** Set once another Quick Open provider takes over, so that late updates do nothing. */
	handedOff: boolean;
	/** Increases on each update, so that an update that waited for the file list can tell it is out of date. */
	revision: number;
}

/** "Go to File" with the vendored scorer. */
export class FilePicker {
	private session: Session | undefined;
	private readonly removeButton: vscode.QuickInputButton = {
		iconPath: new vscode.ThemeIcon('close'),
		tooltip: 'Remove from Recently Opened',
	};

	/**
	 * @param index The workspace files.
	 * @param history Recently opened files, shown when the query is empty.
	 * @param onFileListError Called when the file list cannot be built, after the built-in Quick Open took over.
	 */
	constructor(
		private readonly index: FileIndex,
		private readonly history: RecentlyOpened,
		private readonly onFileListError: (error: unknown) => void,
	) { }

	show(): void {
		if (this.session) {
			// Cmd+P was pressed again before the context key reached the keybinding service.
			void vscode.commands.executeCommand('workbench.action.quickOpenNavigateNext');
			return;
		}

		const picker = vscode.window.createQuickPick<PickerItem>();
		picker.placeholder = PLACEHOLDER;
		picker.matchOnDescription = true;
		// Every item has `alwaysShow`, and the picker must keep the order of `items`.
		// Without this, it moves the items whose label matches its own simple filter to the top.
		picker.sortByLabel = false;

		const session: Session = {
			picker,
			openToSideButton: createOpenToSideButton(),
			cache: Object.create(null),
			range: undefined,
			lastFile: undefined,
			handedOff: false,
			revision: 0,
		};
		this.session = session;

		const listeners = [
			picker.onDidChangeValue(() => void this.update(session)),
			picker.onDidChangeActive(([item]) => {
				if (item && isFileItem(item)) {
					session.lastFile = item;
				}
			}),
			picker.onDidAccept(() => void this.accept('default')),
			picker.onDidTriggerItemButton(event => void this.onItemButton(session, event)),
			picker.onDidHide(() => {
				if (this.session === session) {
					this.session = undefined;
					void setVisibleContext(false);
				}
				vscode.Disposable.from(...listeners).dispose();
				picker.dispose();
			}),
		];

		void setVisibleContext(true);
		void this.update(session);
		picker.show();
	}

	/**
	 * Opens the selected file.
	 * @param mode Which key opened it.
	 */
	async accept(mode: OpenMode): Promise<void> {
		const session = this.session;
		const item = session?.picker.activeItems[0];
		if (!session || !item || !isFileItem(item)) {
			return;
		}

		if (mode !== 'background') {
			session.picker.hide();
		}
		await openFile(item.uri, mode, session.range);
	}

	private async update(session: Session): Promise<void> {
		const { picker } = session;
		const revision = ++session.revision;
		if (session.handedOff) {
			return;
		}

		const input = parseInput(picker.value);
		if (input.kind === 'handoff') {
			this.handOff(session, input.value);
			return;
		}

		if (session.lastFile && wantsSymbols(input, vscode.workspace.asRelativePath(session.lastFile.uri))) {
			session.handedOff = true;
			await showSymbols(session, session.lastFile);
			return;
		}

		session.range = input.range;
		if (!input.filter.trim()) {
			picker.items = this.historyItems(session);
			return;
		}

		let files: readonly IndexedFile[];
		try {
			picker.busy = !this.index.isReady;
			files = await this.index.getFiles();
		} catch (error) {
			this.handOff(session, picker.value);
			this.onFileListError(error);
			return;
		}

		// A newer keystroke already updated the list while this one waited for the files.
		if (revision !== session.revision || session.handedOff) {
			return;
		}

		picker.busy = false;
		picker.items = rankFiles(files, input.filter, MAX_RESULTS, session.cache).map(file => fileItem(file, [session.openToSideButton]));
	}

	/** Lets the built-in Quick Open handle the value, for example `>` for commands. */
	private handOff(session: Session, value: string): void {
		session.handedOff = true;
		void vscode.commands.executeCommand('workbench.action.quickOpen', value);
	}

	private historyItems(session: Session): PickerItem[] {
		const items = this.history.list()
			.filter(uri => !vscode.workspace.getWorkspaceFolder(uri) || this.index.has(uri))
			.map(uri => historyItem(uri, [session.openToSideButton, this.removeButton]));
		return items.length > 0 ? [{ label: 'recently opened', kind: vscode.QuickPickItemKind.Separator }, ...items] : [];
	}

	private async onItemButton(session: Session, event: vscode.QuickPickItemButtonEvent<PickerItem>): Promise<void> {
		if (!isFileItem(event.item)) {
			return;
		}

		if (event.button === this.removeButton) {
			this.history.remove(event.item.uri);
			session.picker.items = this.historyItems(session);
			return;
		}

		session.picker.hide();
		await openFile(event.item.uri, 'side', session.range);
	}
}

function isFileItem(item: PickerItem): item is FileItem {
	return 'uri' in item;
}

function fileItem(file: IndexedFile, buttons: vscode.QuickInputButton[]): FileItem {
	return {
		label: file.label,
		description: file.description,
		uri: file.uri,
		resourceUri: file.uri,
		iconPath: vscode.ThemeIcon.File,
		alwaysShow: true,
		buttons,
	};
}

/**
 * History items leave the label and description empty, so that VS Code fills them in like
 * Quick Open does. For example, it shortens the home folder of a file outside the workspace to `~`.
 */
function historyItem(uri: vscode.Uri, buttons: vscode.QuickInputButton[]): FileItem {
	return {
		label: '',
		uri,
		resourceUri: uri,
		iconPath: vscode.ThemeIcon.File,
		alwaysShow: true,
		buttons,
	};
}

function createOpenToSideButton(): vscode.QuickInputButton {
	const direction = vscode.workspace.getConfiguration('workbench.editor').get<string>('openSideBySideDirection', 'right');
	return {
		iconPath: new vscode.ThemeIcon(direction === 'right' ? 'split-horizontal' : 'split-vertical'),
		tooltip: direction === 'right' ? 'Open to the Side' : 'Open to the Bottom',
	};
}

/** Opens the file with the same editor options as Quick Open's `openAnything`. */
async function openFile(uri: vscode.Uri, mode: OpenMode, range: IRange | undefined): Promise<void> {
	const editor = vscode.workspace.getConfiguration('workbench.editor');
	const openEditorPinned = !editor.get<boolean>('enablePreviewFromQuickOpen', false) || !editor.get<boolean>('enablePreview', true);
	const pinned = mode === 'alternative' || mode === 'background' || openEditorPinned;
	const toSide = mode === 'side' || (mode === 'alternative' && openEditorPinned);

	const options: vscode.TextDocumentShowOptions = {
		preserveFocus: mode === 'background',
		preview: !pinned,
		viewColumn: toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
		selection: range && toSelection(range),
	};
	await vscode.commands.executeCommand('vscode.open', uri, options);
}

/** Opens the file, then shows its symbols in the built-in `@` picker, like Quick Open does. */
async function showSymbols(session: Session, file: FileItem): Promise<void> {
	await vscode.commands.executeCommand('vscode.open', file.uri, { preserveFocus: true });

	// Read the value again, because the user may have typed more while the file opened.
	const input = parseInput(session.picker.value);
	const symbolFilter = input.kind === 'files' ? input.symbolFilter : '';
	await vscode.commands.executeCommand('workbench.action.quickOpen', `@${symbolFilter}`);
}

/** Converts Quick Open's 1-based range to a 0-based selection. */
function toSelection(range: IRange): vscode.Range {
	return new vscode.Range(
		Math.max(range.startLineNumber - 1, 0),
		Math.max(range.startColumn - 1, 0),
		Math.max(range.endLineNumber - 1, 0),
		Math.max(range.endColumn - 1, 0),
	);
}

function setVisibleContext(visible: boolean): Thenable<unknown> {
	return vscode.commands.executeCommand('setContext', VISIBLE_CONTEXT_KEY, visible);
}
