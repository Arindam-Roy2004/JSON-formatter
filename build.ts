import { build, context, type BuildOptions } from 'esbuild'
import { cpSync, mkdirSync, rmSync, readdirSync } from 'fs'

const isWatch = process.argv.includes('--watch')

// Out with the old, in with the new directory! Clean slate.
rmSync('out', { recursive: true, force: true })
mkdirSync('out', { recursive: true })

// Let's drag over our non-compiled goodies over to out/ so they don't feel left out.
cpSync('src/manifest.json', 'out/manifest.json')

// Sweep the icons folder and copy over our tiny png art files. They need love too.
for (const file of readdirSync('assets')) {
	const isIcon = file.startsWith('icon-') && file.endsWith('.png')
	if (isIcon) cpSync(`assets/${file}`, `out/${file}`)
}

const options: BuildOptions = {
	entryPoints: ['src/content.ts'],
	bundle: true,
	outdir: 'out',
	format: 'iife',
	target: 'chrome120',
	minify: !isWatch,
	loader: { '.css': 'text' },
}

if (isWatch) {
	const ctx = await context(options)
	await ctx.watch()
	console.log('Watching for changes...')
} else {
	await build(options)
	console.log('Build complete → out/')
}
