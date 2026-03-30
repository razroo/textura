# @razroo/textura-mcp

MCP server for Textura — gives AI agents layout vision. Compute exact pixel geometry, detect layout issues, validate responsive breakpoints, and auto-fix problems, all without a browser.

Works with **any framework** (React, Vue, Svelte, React Router, Tailwind, plain HTML). The AI agent translates component code into a framework-agnostic layout tree.

## Tools

### `compute_layout`
Compute exact pixel positions and sizes for a layout tree.

### `analyze_layout`
Find layout issues: text overflow, element overlap, small touch targets, cramped line heights, tight spacing.

### `validate_responsive`
Check a layout at multiple breakpoints (mobile/tablet/desktop/wide) in a single call. Returns per-breakpoint issues and pass/fail.

### `fix_layout`
Automatically fix detected issues: expand touch targets to 44px, increase cramped line heights, widen tight gaps, add flexShrink/flexWrap for overflow.

## Setup

### Claude Code

Add to your project's `.mcp.json` (or `~/.claude/settings.json` for global):

```json
{
  "mcpServers": {
    "textura": {
      "command": "npx",
      "args": ["-y", "@razroo/textura-mcp"]
    }
  }
}
```

### Codex (OpenAI)

```json
{
  "mcpServers": {
    "textura": {
      "command": "npx",
      "args": ["-y", "@razroo/textura-mcp"]
    }
  }
}
```

## How the AI Agent Uses It

The agent reads your component code (React, Vue, Tailwind, etc.) and translates the layout structure into a Textura tree:

```
// Your React component:
<div className="flex flex-col gap-4 p-6">
  <h1 className="text-2xl font-bold">Dashboard</h1>
  <p className="text-base">Welcome back</p>
</div>

// AI translates to Textura tree:
{
  "flexDirection": "column",
  "gap": 16,
  "padding": 24,
  "children": [
    { "text": "Dashboard", "font": "700 24px Inter", "lineHeight": 32 },
    { "text": "Welcome back", "font": "16px Inter", "lineHeight": 24 }
  ]
}
```

The MCP computes exact layout geometry and checks for issues — the AI agent then applies fixes back to your actual code.

## Building from Source

```sh
cd mcp
npm install
npm run build
```
