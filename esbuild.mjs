import * as esbuild from 'esbuild';

const common = {
	bundle: true,
	platform: 'node',
	target: 'node22',
	sourcemap: true,
	logLevel: 'warning',
};

if (process.argv.includes('--tests')) {
	// Tests and scripts never import 'vscode', so they run in plain Node.
	await esbuild.build({
		...common,
		entryPoints: ['test/*.test.ts', 'scripts/*.ts'],
		outdir: 'out',
		outbase: '.',
		format: 'esm',
		outExtension: { '.js': '.mjs' },
	});
} else {
	await esbuild.build({
		...common,
		entryPoints: ['src/extension.ts'],
		outfile: 'dist/extension.js',
		format: 'cjs',
		external: ['vscode'],
	});
}
