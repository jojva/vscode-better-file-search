# Better File Search

A replacement for VS Code's "Go to File" (Cmd+P) that keeps its ranking, with one change.

VS Code ranks a file whose name contains the letters of your query above every file that needs
its folder to match, however scattered the letters are. Typing `rulevers` to find
`src/rules/Version.h` lists `RuleValueParserTest.cpp` first, because its name contains
r-u-l-e-v-e-r-s in that order. This extension only gives that bonus to a file name match where
every group of matched letters starts a word. Other files are ranked on their full path, as VS Code
already does for files whose name does not match.

The scorer is VS Code's own, copied from version 1.140.0 into `src/vendor/vscode`. The change is
about 20 lines in `fuzzyScorer.ts`.

## Install

```sh
npm install
npm run install-extension
```

The extension lists files with `findFiles2`, a proposed API that respects `.gitignore` like Cmd+P
does. VS Code only allows proposed APIs for extensions you list. Run "Preferences: Configure
Runtime Arguments" and add:

```jsonc
"enable-proposed-api": ["jojva.vscode-better-file-search"]
```

Then restart VS Code. Without this, Cmd+P falls back to the built-in Quick Open and shows an error.

## Usage

Cmd+P opens the picker. It works like Quick Open:

| Key or input | Effect |
|---|---|
| Enter | Open the file |
| Cmd+Enter | Open pinned. To the side when Quick Open does not open previews, which is the default |
| Alt+Enter | Open to the side |
| Right arrow at the end of the input | Open in the background and keep the picker open |
| Cmd+P while the picker is open | Move down. Release Cmd to open |
| `file:42`, `file:42:7`, `file#42` | Open at that line and column |
| `file@` | Open the selected file and list its symbols |
| `>`, `@`, `:`, `#`, `?`, `%` at the start | Switch to the built-in commands, symbols, go to line, workspace symbols, help, or text search |

An empty input lists recently opened files. The built-in "Go to File..." is still in the Command
Palette.

## Differences from Quick Open

- Matched letters are not highlighted, or are highlighted wrongly. VS Code draws the highlights
  with its own matcher, and extensions cannot provide them.
- Recently opened files only show when the input is empty. Extensions cannot read VS Code's editor
  history, so the extension records the active tab itself. Its list starts from the tabs that are
  open when it first runs in a workspace.
- Workspace symbols never mix with file results, even with `search.quickOpen.includeSymbols`.
- `file@symbol` switches to the built-in symbol picker instead of listing symbols in place.

## Development

```sh
npm test            # unit tests, in plain Node
npm run typecheck
```

To check the ranking on a real repo:

```sh
rg --files --hidden -g '!.git' > /tmp/files.txt
npm test && node out/scripts/rank.mjs /tmp/files.txt rulevers 20
```
