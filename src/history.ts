import * as vscode from 'vscode';

const STORAGE_KEY = 'recentlyOpened';

/** Same cap as VS Code's editor history. */
const MAX_ENTRIES = 200;

/**
 * Most recently opened files, newest first, as shown by an empty Quick Open.
 * Extensions cannot read VS Code's own editor history, so this list follows the active editor tab
 * and starts from the tabs that are open when the extension first runs in a workspace.
 */
export class RecentlyOpened implements vscode.Disposable {
	private uris: vscode.Uri[];
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly state: vscode.Memento) {
		this.uris = state.get<string[]>(STORAGE_KEY, []).map(uri => vscode.Uri.parse(uri));
		if (this.uris.length === 0) {
			this.seedFromOpenTabs();
		}

		this.recordActiveTab();
		this.disposables.push(
			vscode.window.tabGroups.onDidChangeTabs(() => this.recordActiveTab()),
			vscode.window.tabGroups.onDidChangeTabGroups(() => this.recordActiveTab()),
			vscode.workspace.onDidRenameFiles(e => {
				for (const { oldUri, newUri } of e.files) {
					this.uris = this.uris.map(uri => uri.toString() === oldUri.toString() ? newUri : uri);
				}
				this.save();
			}),
			vscode.workspace.onDidDeleteFiles(e => {
				for (const uri of e.files) {
					this.remove(uri);
				}
			}),
		);
	}

	/** The files, newest first. The first one is usually the active editor. */
	list(): readonly vscode.Uri[] {
		return this.uris;
	}

	remove(uri: vscode.Uri): void {
		const key = uri.toString();
		this.uris = this.uris.filter(entry => entry.toString() !== key);
		this.save();
	}

	dispose(): void {
		vscode.Disposable.from(...this.disposables).dispose();
	}

	private seedFromOpenTabs(): void {
		const groups = vscode.window.tabGroups;
		const active = groups.activeTabGroup;
		for (const group of [active, ...groups.all.filter(group => group !== active)]) {
			const tabs = group.activeTab ? [group.activeTab, ...group.tabs.filter(tab => tab !== group.activeTab)] : group.tabs;
			for (const tab of tabs) {
				const uri = tabUri(tab);
				if (uri && !this.uris.some(entry => entry.toString() === uri.toString())) {
					this.uris.push(uri);
				}
			}
		}
		this.save();
	}

	private recordActiveTab(): void {
		const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
		const uri = tab && tabUri(tab);
		if (!uri || this.uris[0]?.toString() === uri.toString()) {
			return;
		}

		const key = uri.toString();
		this.uris = [uri, ...this.uris.filter(entry => entry.toString() !== key)].slice(0, MAX_ENTRIES);
		this.save();
	}

	private save(): void {
		void this.state.update(STORAGE_KEY, this.uris.map(uri => uri.toString()));
	}
}

/** The file a tab shows, if it is a file that Quick Open could open again. */
function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
	const input = tab.input;
	const uri = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook
		? input.uri
		: undefined;
	if (!uri) {
		return undefined;
	}

	return uri.scheme === 'file' || vscode.workspace.getWorkspaceFolder(uri) ? uri : undefined;
}
