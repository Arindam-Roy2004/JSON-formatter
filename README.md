# My Simple JSON Formatter ✨

A super lightweight, totally magical Chrome extension that automatically takes those boring, unreadable walls of raw JSON text and transforms them into a beautiful, syntax-highlighted, and collapsible tree view!

## Why you'll love it (The Features!) 🚀

- **Smart Auto-detection** — We quietly sniff out `application/json`, `text/json`, or `text/plain` pages and format them instantly if they're actual JSON.
- **Pretty Syntax Highlighting** — Say goodbye to monochrome blobs! Color-coded keys, strings, numbers, booleans, and nulls. (Now with JetBrains Mono font!)
- **Collapsible Nodes** — Click the little carets to fold up massive objects and arrays. Your scrolling finger will thank you.
- **Per-field Copy** — Hover over any line and click the shiny copy icon to grab exactly that value. No more clumsy text selection!
- **Clickable URLs** — Because who wants to copy-paste a link just to open it?
- **Light & Dark Mode** — We respect your eyeballs and automatically match your system theme.
- **Escape Hatch (Raw mode)** — Need the original messy text back? Just slap `#raw` onto the end of the URL and we'll back off.
- **Zero Creepy Permissions** — We don't use background scripts, we don't store your data, and we definitely don't phone home. Just pure, local magic!

## How to get it on your machine 🛠️

**[Check it out on my GitHub!](https://github.com/arindamroy/simple-json-formatter)**

If you want to build it yourself, roll up your sleeves:

1. Clone this repo down to your machine.
2. Grab the dependencies and fire up the build:
   ```sh
   pnpm install
   pnpm run build
   ```
3. Pop open `chrome://extensions` in your Chrome browser.
4. Flip the switch for **Developer mode** in the top right corner.
5. Hit **Load unpacked** and point it straight at that shiny new `out/` folder we just built!

## Tinkering & Development 🔬

```sh
pnpm run dev          # Watch mode — automatically rebuilds every time you hit save!
pnpm run build        # Production build → dumps everything into out/
pnpm run lint         # Run the linter to catch silly mistakes
pnpm run typecheck    # Make sure TypeScript is happy
pnpm run format       # Prettier makes the code look pretty
```

## How things are organized 📂

```
src/
├── content.ts        # The engine room! Handles detection, rendering, and all the clicking.
├── styles.css        # Where the magic happens with light/dark theme CSS variables.
├── manifest.json     # Chrome's instruction manual for our extension (MV3).
└── css.d.ts          # Just keeping TypeScript happy about importing CSS files.
out/                  # Where the final build lives. This is what Chrome actually loads!
```

## License 📜

MIT — Crafted with ❤️ by [Arindam Roy](https://github.com/arindamroy)
