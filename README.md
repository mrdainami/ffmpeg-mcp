# @dainami/ffmpeg-mcp

> A tiny MCP server that lets Claude (Desktop, Code, or any MCP client) **download files** and **run local shell commands** — built for composing video ads with ffmpeg, useful for any local command-execution.

Two tools. No magic, no recipes baked in. The agent writes the ffmpeg command; this just runs it.

---

## ⚠️ Security note

`shell_run` executes **arbitrary shell commands** as your user. Only install this MCP if you trust the agent driving it. If you want a safer compose path, set `FFMPEG_MCP_WORKDIR` to a sandbox folder so relative paths stay there (absolute paths still escape it).

---

## Install in Claude Desktop (3 minutes, no terminal needed)

> **Prerequisite:** ffmpeg must be installed on your machine.
> - **macOS:** `brew install ffmpeg`
> - **Linux:** `sudo apt install ffmpeg` (or your distro's package manager)
> - **Windows:** download from [ffmpeg.org](https://ffmpeg.org/download.html), add to PATH

1. **Download `ffmpeg-mcp.mcpb`** from the [latest release](https://github.com/mrdainami/ffmpeg-mcp/releases).
2. In Claude Desktop: open **Settings → Extensions** (or drag the `.mcpb` onto the Claude Desktop window).
3. When prompted, pick a working directory (e.g. `~/AINIO/ads`). Files download here, ffmpeg writes its output here.
4. Restart Claude Desktop.

To verify: open a chat → click **+** → **Connectors** → "ffmpeg (local shell)" should appear with 2 tools.

> **Why `.mcpb`?** It's Anthropic's drag-and-drop install format for local MCP servers. No JSON editing, no Node.js install required (Claude Desktop bundles its own Node runtime). [Read more →](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

---

## Install manually (Claude Code, or Claude Desktop without `.mcpb`)

Requires Node.js 18+ AND ffmpeg on `PATH`.

**Claude Code:**

```bash
claude mcp add ffmpeg --env FFMPEG_MCP_WORKDIR=~/AINIO/ads -- npx -y @dainami/ffmpeg-mcp
```

Or in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@dainami/ffmpeg-mcp"],
      "env": { "FFMPEG_MCP_WORKDIR": "~/AINIO/ads" }
    }
  }
}
```

**Claude Desktop (manual JSON):** edit `claude_desktop_config.json`

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@dainami/ffmpeg-mcp"],
      "env": { "FFMPEG_MCP_WORKDIR": "~/AINIO/ads" }
    }
  }
}
```

Restart Claude Desktop.

---

## What the agent does with these tools

Typical compose flow:

```ts
// 1. Pull the inputs to local disk
await download({ url: "https://pub-xxx.r2.dev/aop/seg-A.mp4", destPath: "ad2/seg-A.mp4" });
await download({ url: "https://pub-xxx.r2.dev/aop/seg-B.mp4", destPath: "ad2/seg-B.mp4" });
await download({ url: "https://pub-xxx.r2.dev/aop/seg-C.mp4", destPath: "ad2/seg-C.mp4" });

// 2. Run ffmpeg (agent constructs the full command from its knowledge files)
await shell_run({
  command: `ffmpeg \\
    -i seg-A.mp4 -i seg-B.mp4 -i seg-C.mp4 \\
    -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a] concat=n=3:v=1:a=1 [outv][outa]" \\
    -map "[outv]" -map "[outa]" \\
    -c:v libx264 -crf 18 -c:a aac -b:a 192k -movflags +faststart \\
    final.mp4`,
  workdir: "ad2",
  timeoutSec: 600
});
```

`final.mp4` lands at `~/AINIO/ads/ad2/final.mp4`. Agent reports the path to the user.

---

## The 2 tools

### `download(url, destPath)`

Pull a public URL to a local file. Creates parent directories. Returns `{ ok, path, bytes }`.

```ts
download({
  url: "https://example.com/video.mp4",
  destPath: "downloads/video.mp4"
})
```

`destPath` is relative to `FFMPEG_MCP_WORKDIR` (or absolute).

### `shell_run(command, workdir, timeoutSec)`

Run any shell command. Returns `{ ok, exitCode, stdout, stderr, durationMs, cwd }`.

```ts
shell_run({
  command: "ffmpeg -i input.mp4 -c:v libx264 -crf 18 output.mp4",
  workdir: "myproject",
  timeoutSec: 600
})
```

- `shell: true` — heredocs, pipes, redirects all work
- Default timeout: 1800s (30 min)
- Workdir is created if missing

---

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `FFMPEG_MCP_WORKDIR` | `process.cwd()` | Default workdir + base for relative paths. `~` expands. |

---

## Develop locally

```bash
git clone https://github.com/mrdainami/ffmpeg-mcp
cd ffmpeg-mcp
npm install
npm run build
```

Point Claude at your local copy:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "node",
      "args": ["/absolute/path/to/ffmpeg-mcp/dist/index.js"],
      "env": { "FFMPEG_MCP_WORKDIR": "~/AINIO/ads" }
    }
  }
}
```

For dev with auto-reload:

```bash
npm run dev
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built for the [AINIO Story Ads Project](https://github.com/mrdainami/ainio-story-ads). PRs and issues welcome.
