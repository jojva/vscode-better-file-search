/** Prefix of the context keys that the extension sets itself. */
const OWN_PREFIX = 'betterFileSearch.';

/**
 * Lists the VS Code context keys that the extension's keybindings depend on.
 * @param packageJson The extension's package.json.
 * @returns The keys, sorted, without the extension's own keys.
 */
export function workbenchContextKeys(packageJson: unknown): string[] {
	const keybindings = (packageJson as { contributes?: { keybindings?: { when?: string }[] } }).contributes?.keybindings ?? [];
	const keys = new Set<string>();
	for (const { when } of keybindings) {
		// Quoted values, as in `quickInputType == 'quickPick'`, are not keys.
		const identifiers = when?.replace(/'[^']*'/g, '').match(/[A-Za-z_][\w.]*/g) ?? [];
		for (const key of identifiers) {
			if (!key.startsWith(OWN_PREFIX) && key !== 'true' && key !== 'false') {
				keys.add(key);
			}
		}
	}
	return [...keys].sort();
}
