import { execSync } from 'child_process'
import { resolve } from 'path'

// We need an array of our favorite chrome extension icon dimensions right here
const sizes = [16, 32, 48, 128]
const html = resolve(import.meta.dirname, 'render-icons.html')

// Iterate and whip out a shiny new png using headless browser rendering magic for each needed size!
for (const size of sizes) {
	const out = resolve(import.meta.dirname, `icon-${size}.png`)
	const url = `file://${html}?size=${size}`

	execSync(
		`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ` +
			`--headless=new --disable-gpu --screenshot="${out}" ` +
			`--window-size=${size},${size} --default-background-color=00000000 ` +
			`"${url}"`,
		{ stdio: 'ignore' }
	)
	console.log(`icon-${size}.png`)
}

console.log('Done')
