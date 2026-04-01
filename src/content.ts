/**
 * My Simple JSON Formatter — The Engine Room (Content Script)
 *
 * This little script keeps an eye out for raw JSON documents and magically 
 * transforms them into a beautiful, syntax-highlighted, and collapsible tree view!
 *
 * How it stays out of your way:
 *  - We don't ask for scary broad permissions in the manifest, just `<all_urls>` for the content scripts.
 *  - The CSS isn't loaded everywhere. We bundle it right in here and only inject it when we KNOW we're looking at JSON.
 *  - We run super early (`document_start`) so we can catch it before the browser even draws the page.
 *
 * Why it's fast:
 *  - We stick to `textContent` (skipping `innerHTML` to bypass the slow HTML parser and avoid nasty XSS stuff).
 *  - The whole DOM tree is built off-screen in a `DocumentFragment` first (hello, single reflow!).
 *  - Event delegation means we just slap one click listener on the container, not on every single node.
 *  - Trees deeper than `MAX_OPEN_DEPTH` get automatically folded up for you.
 *
 * How the gears turn underneath:
 *  - Detection happens in clear steps: ContentTypeKind → PreDetectionResult → ParseResult. No guessing!
 *  - Our click listener figures out exactly what you clicked (toggle, copy button, or nothing important).
 *  - Toggles are literally just true/false flags we track in a map. Easy.
 */

import styles from './styles.css'

// ── Building Blocks (Types) ─────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
interface JsonObject {
	[key: string]: JsonValue
}

interface ToggleState {
	isCollapsed: boolean
	inner: HTMLDivElement
	ellipsis: HTMLSpanElement
	count: HTMLSpanElement
}

/** Result of classifying the document's content-type header. */
type ContentTypeKind = 'json' | 'text' | 'unsupported'

/** Result of looking for a valid <pre> element in the DOM. */
type PreDetectionResult =
	| { isFound: true; pre: HTMLPreElement }
	| { isFound: false; reason: 'no-body' | 'no-pre' | 'multiple-pre' | 'has-text-elements' | 'is-hidden' | 'is-empty' }

/** Result of attempting to parse raw text as JSON. */
type ParseResult =
	| { isValid: true; value: JsonValue }
	| { isValid: false; reason: 'parse-error' | 'is-scalar' }

/** Classification of a click target inside the JSON container. */
type ClickTarget =
	| { kind: 'toggle'; element: HTMLSpanElement; state: ToggleState }
	| { kind: 'copy-icon'; element: HTMLSpanElement; value: JsonValue }
	| { kind: 'unrelated' }

// ── Strict Safety Guard ─────────────────────────────────────────────────

/**
 * Super strict check! If we missed adding a case in our switch statements, 
 * TypeScript will totally yell at us because we shouldn't be here.
 * If this throws at runtime, well, we broke something.
 */
function exhaustiveGuard(value: never): never {
	throw new Error(`Uh oh, unhandled type slipped through: ${JSON.stringify(value)}`)
}

// ── Where the Magic Starts ──────────────────────────────────────────────

/**
 * Our sneaky little self-invoking function wrapper. Space is grabbed at `document_start`
 * so the `body` tag might not even be born yet. Wait for it... Wait for it... Go!
 */
;(() => {
	const isRawMode = window.location.hash === '#raw'
	if (isRawMode) return

	const onReady = () => {
		document.removeEventListener('DOMContentLoaded', onReady)
		detectAndFormat()
	}

	const isStillLoading = document.readyState === 'loading'
	if (isStillLoading) {
		document.addEventListener('DOMContentLoaded', onReady)
	} else {
		detectAndFormat()
	}
})()

// ── Sniffing out JSON ───────────────────────────────────────────────────

/**
 * The big detector! It goes step by step to see if this page is actually JSON. Let's look!
 *
 * Sequence: ContentTypeKind → PreDetectionResult → ParseResult → RENDER TIME!
 */
function detectAndFormat(): void {
	// Step 1: Let's figure out what kind of content type header we have on our hands
	const contentTypeKind = classifyContentType(document.contentType || '')
	switch (contentTypeKind) {
		case 'json':
		case 'text':
			break // Oh good, let's keep going!
		case 'unsupported':
			return // Whoops, definitely not our type.
		default:
			exhaustiveGuard(contentTypeKind)
	}

	// Step 2: Ensure the page's structure makes sense (looks like a fresh raw tab)
	const preResult = detectPre()
	if (!preResult.isFound) return

	// Step 3: Okay, the hardest part. Is it ACTUAL parseable JSON?
	const parseResult = tryParseJson(preResult.pre.textContent || '')
	if (!parseResult.isValid) return

	// Everything passed, let's render the beauty!
	render(parseResult.value, preResult.pre.textContent || '')
}

/** 
 * Try to identify the MIME type from the headers and throw it into clear buckets. 
 */
function classifyContentType(contentType: string): ContentTypeKind {
	const isJsonMime = /^application\/(json|[\w.+-]*\+json)/.test(contentType)
	if (isJsonMime) return 'json'

	const isTextMime = contentType === 'text/plain' || contentType === 'text/json'
	if (isTextMime) return 'text'

	return 'unsupported'
}

/**
 * Make sure the page is completely naked of random HTML.
 * We want a `<pre>` element acting like the only kid on the playground.
 */
function detectPre(): PreDetectionResult {
	const body = document.body
	if (!body) return { isFound: false, reason: 'no-body' }

	const pres = body.querySelectorAll('pre')
	if (pres.length === 0) return { isFound: false, reason: 'no-pre' }
	if (pres.length > 1) return { isFound: false, reason: 'multiple-pre' }

	// If there are annoying random HTML elements everywhere, this ain't raw data!
	const hasTextElements =
		body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, table').length > 0
	if (hasTextElements) return { isFound: false, reason: 'has-text-elements' }

	const pre = pres[0]

	const isHidden =
		pre.offsetParent === null && getComputedStyle(pre).display === 'none'
	if (isHidden) return { isFound: false, reason: 'is-hidden' }

	const isEmpty = !pre.textContent || !pre.textContent.trim()
	if (isEmpty) return { isFound: false, reason: 'is-empty' }

	return { isFound: true, pre }
}

/**
 * Attempt to convert raw text into true JSON.
 * We instantly reject flat text/scalars because drawing trees for a single string is kinda silly.
 */
function tryParseJson(raw: string): ParseResult {
	let value: JsonValue
	try {
		value = JSON.parse(raw) as JsonValue
	} catch {
		return { isValid: false, reason: 'parse-error' }
	}

	const isScalar = typeof value !== 'object' || value === null
	if (isScalar) return { isValid: false, reason: 'is-scalar' }

	return { isValid: true, value }
}

// ── Painting the UI ─────────────────────────────────────────────────────

/** How deep the tree can go before we automatically fold it closed. Space saver! */
const MAX_OPEN_DEPTH = 4

/** A little map keeping track of every toggle arrow (the little carrots) so we know who is open/closed. */
const toggleMap = new Map<HTMLSpanElement, ToggleState>()

/** An easy way to map the shiny copy buttons over to their respective raw values. Saves so much time doing this! */
const copyValueMap = new Map<HTMLSpanElement, JsonValue>()

/**
 * Sweeps the entire boring raw page under the rug and mounts the glorious, magical
 * glowing JSON formatting right on top!
 * P.S. This is exactly where our bundled shiny CSS sneaks onto the page.
 */
function render(parsed: JsonValue, rawText: string): void {
	const fragment = document.createDocumentFragment()

	// Inject CSS (only on JSON pages)
	const style = document.createElement('style')
	style.textContent = styles
	fragment.appendChild(style)

	// Toolbar
	const toolbar = document.createElement('div')
	toolbar.className = 'sjf-toolbar'

	const title = document.createElement('span')
	title.className = 'sjf-title'
	title.textContent = 'My Simple JSON Formatter'

	const rawLink = document.createElement('a')
	rawLink.className = 'sjf-btn'
	rawLink.textContent = 'Raw'
	rawLink.href = window.location.href.split('#')[0] + '#raw'
	rawLink.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault()
		window.location.hash = '#raw'
		window.location.reload()
	})

	const copyBtn = document.createElement('button')
	copyBtn.className = 'sjf-btn'
	copyBtn.textContent = 'Copy All'
	copyBtn.addEventListener('click', () => {
		navigator.clipboard.writeText(JSON.stringify(parsed, null, 2))
		copyBtn.textContent = 'Copied!'
		setTimeout(() => {
			copyBtn.textContent = 'Copy All'
		}, 1500)
	})

	const githubLink = document.createElement('a')
	githubLink.className = 'sjf-btn'
	githubLink.textContent = 'GitHub'
	githubLink.href = 'https://github.com/Arindam-Roy2004/JSON-formatter'
	githubLink.target = '_blank'
	githubLink.rel = 'noopener noreferrer'

	const size = document.createElement('span')
	size.className = 'sjf-size'
	size.textContent = formatBytes(rawText.length)

	toolbar.append(title, size, githubLink, rawLink, copyBtn)

	// JSON tree
	const container = document.createElement('div')
	container.className = 'sjf-container'
	container.appendChild(renderValue(parsed, 0))
	container.addEventListener('click', handleContainerClick)

	fragment.append(toolbar, container)

	document.body.innerHTML = ''
	document.body.classList.add('sjf-body')
	document.body.appendChild(fragment)
}

// ── Event delegation ────────────────────────────────────────────────────

/** Classifies what was clicked inside the container. */
function classifyClickTarget(target: HTMLSpanElement): ClickTarget {
	const hasToggleState = toggleMap.has(target)
	if (hasToggleState) {
		return { kind: 'toggle', element: target, state: toggleMap.get(target)! }
	}

	const hasCopyValue = copyValueMap.has(target)
	if (hasCopyValue) {
		return { kind: 'copy-icon', element: target, value: copyValueMap.get(target)! }
	}

	return { kind: 'unrelated' }
}

/** Single click handler for all interactive elements inside the container. */
function handleContainerClick(e: MouseEvent): void {
	const classified = classifyClickTarget(e.target as HTMLSpanElement)

	switch (classified.kind) {
		case 'toggle': {
			const { element, state } = classified
			const wasCollapsed = state.isCollapsed

			state.isCollapsed = !wasCollapsed
			state.inner.style.display = wasCollapsed ? '' : 'none'
			state.ellipsis.style.display = wasCollapsed ? 'none' : ''
			state.count.style.display = wasCollapsed ? 'none' : ''
			element.textContent = wasCollapsed ? '\u25BE' : '\u25B8'
			return
		}

		case 'copy-icon': {
			e.stopPropagation()
			const { element, value } = classified
			const isString = typeof value === 'string'
			const text = isString ? value : JSON.stringify(value, null, 2)
			navigator.clipboard.writeText(text)
			element.textContent = '\u2713'
			element.classList.add('sjf-copy-icon-done')
			setTimeout(() => {
				element.textContent = '\u2398'
				element.classList.remove('sjf-copy-icon-done')
			}, 1200)
			return
		}

		case 'unrelated':
			return

		default:
			exhaustiveGuard(classified)
	}
}

// ── Tree renderers ──────────────────────────────────────────────────────

/**
 * Renders any JSON value into a DOM node.
 * Exhaustively handles every JSON value type.
 */
function renderValue(value: JsonValue, depth: number): HTMLSpanElement {
	if (value === null) return makeSpan('null', 'sjf-null')

	switch (typeof value) {
		case 'string':
			return renderString(value)
		case 'number':
			return makeSpan(String(value), 'sjf-number')
		case 'boolean':
			return makeSpan(String(value), 'sjf-boolean')
		case 'object': {
			const isArray = Array.isArray(value)
			return isArray
				? renderArray(value, depth)
				: renderObject(value, depth)
		}
		default:
			exhaustiveGuard(value)
	}
}

/**
 * Renders a string value. URLs become clickable <a> links.
 */
function renderString(value: string): HTMLSpanElement {
	const wrapper = document.createElement('span')
	wrapper.className = 'sjf-string'

	const isUrl = /^https?:\/\//.test(value) || value.startsWith('//')
	if (isUrl) {
		wrapper.appendChild(document.createTextNode('"'))
		const link = document.createElement('a')
		link.className = 'sjf-link'
		link.href = value
		link.textContent = value
		link.target = '_blank'
		link.rel = 'noopener noreferrer'
		wrapper.appendChild(link)
		wrapper.appendChild(document.createTextNode('"'))
	} else {
		wrapper.textContent = `"${value}"`
	}

	return wrapper
}

/** Renders a JSON object as a collapsible `{ ... }` block. */
function renderObject(obj: JsonObject, depth: number): HTMLSpanElement {
	const keys = Object.keys(obj)
	const isEmpty = keys.length === 0
	if (isEmpty) return makeSpan('{}', 'sjf-bracket')

	const isInitiallyCollapsed = depth >= MAX_OPEN_DEPTH
	const wrapper = document.createElement('span')
	const toggle = makeToggle(isInitiallyCollapsed)
	const open = makeSpan('{', 'sjf-bracket')
	const close = makeSpan('}', 'sjf-bracket')

	const ellipsis = makeSpan('...', 'sjf-ellipsis')
	ellipsis.style.display = isInitiallyCollapsed ? '' : 'none'

	const count = makeSpan(
		`// ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`,
		'sjf-count'
	)
	count.style.display = isInitiallyCollapsed ? '' : 'none'

	const inner = document.createElement('div')
	inner.className = 'sjf-indent'
	if (isInitiallyCollapsed) inner.style.display = 'none'

	const isLastKey = (i: number) => i === keys.length - 1
	keys.forEach((key, i) => {
		const line = document.createElement('div')
		line.className = 'sjf-line'
		line.append(
			makeCopyIcon(obj[key]),
			makeSpan(`"${key}"`, 'sjf-key'),
			makeSpan(': ', 'sjf-colon'),
			renderValue(obj[key], depth + 1)
		)
		if (!isLastKey(i)) line.appendChild(makeSpan(',', 'sjf-comma'))
		inner.appendChild(line)
	})

	toggleMap.set(toggle, {
		isCollapsed: isInitiallyCollapsed,
		inner,
		ellipsis,
		count
	})
	wrapper.append(toggle, open, ellipsis, count, inner, close)
	return wrapper
}

/** Renders a JSON array as a collapsible `[ ... ]` block. */
function renderArray(arr: JsonValue[], depth: number): HTMLSpanElement {
	const isEmpty = arr.length === 0
	if (isEmpty) return makeSpan('[]', 'sjf-bracket')

	const isInitiallyCollapsed = depth >= MAX_OPEN_DEPTH
	const wrapper = document.createElement('span')
	const toggle = makeToggle(isInitiallyCollapsed)
	const open = makeSpan('[', 'sjf-bracket')
	const close = makeSpan(']', 'sjf-bracket')

	const ellipsis = makeSpan('...', 'sjf-ellipsis')
	ellipsis.style.display = isInitiallyCollapsed ? '' : 'none'

	const count = makeSpan(
		`// ${arr.length} ${arr.length === 1 ? 'item' : 'items'}`,
		'sjf-count'
	)
	count.style.display = isInitiallyCollapsed ? '' : 'none'

	const inner = document.createElement('div')
	inner.className = 'sjf-indent'
	if (isInitiallyCollapsed) inner.style.display = 'none'

	const isLastItem = (i: number) => i === arr.length - 1
	arr.forEach((val, i) => {
		const line = document.createElement('div')
		line.className = 'sjf-line'
		line.append(makeCopyIcon(val), renderValue(val, depth + 1))
		if (!isLastItem(i)) line.appendChild(makeSpan(',', 'sjf-comma'))
		inner.appendChild(line)
	})

	toggleMap.set(toggle, {
		isCollapsed: isInitiallyCollapsed,
		inner,
		ellipsis,
		count
	})
	wrapper.append(toggle, open, ellipsis, count, inner, close)
	return wrapper
}

// ── DOM helpers ─────────────────────────────────────────────────────────

/** Creates a <span> with textContent (safe, no HTML parsing). */
function makeSpan(text: string, className: string): HTMLSpanElement {
	const span = document.createElement('span')
	span.className = className
	span.textContent = text
	return span
}

/** Creates a toggle arrow (▾ expanded / ▸ collapsed). */
function makeToggle(isCollapsed: boolean): HTMLSpanElement {
	const btn = document.createElement('span')
	btn.className = 'sjf-toggle'
	btn.textContent = isCollapsed ? '\u25B8' : '\u25BE'
	return btn
}

/** Creates a copy icon, registered in copyValueMap for delegation. */
function makeCopyIcon(value: JsonValue): HTMLSpanElement {
	const btn = document.createElement('span')
	btn.className = 'sjf-copy-icon'
	btn.textContent = '\u2398'
	btn.title = 'Copy value'
	copyValueMap.set(btn, value)
	return btn
}

/** Formats a byte count into a human-readable string. */
function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
