# Vendored VS Code sources

These files come from [microsoft/vscode](https://github.com/microsoft/vscode) at commit
`07f806f999227108933c2e30515b26eecc1fda74` (VS Code 1.140.0), under the MIT license in `LICENSE.txt`.

`vs/base/common/fuzzyScorer.ts` is the scorer that Quick Open uses. The other files are the
modules it imports, copied as they are so that the ranking matches VS Code's.

`fuzzyScorer.ts` has one local change: a file name match only gets the label bonus if every group
of matched letters starts a word. Search for `wordStartsOnly` to find it.
