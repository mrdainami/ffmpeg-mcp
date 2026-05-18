# @dainami/ffmpeg-mcp

> Let Claude **edit, compose, and transcode video and audio** locally with ffmpeg — trim clips, stitch segments, mix voiceover with music, burn captions, generate thumbnails, extract frames, anything ffmpeg can do.

A tiny MCP server with two tools: `download` (pull a remote video / audio file to local disk) and `shell_run` (run any local shell command). Claude writes the actual ffmpeg command from chat using its knowledge of ffmpeg — this just executes it.

No recipes baked in. No DSL to learn. Tell Claude what you want done to a video, it figures out the ffmpeg invocation, and this runs it.

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

## What you can do with it

Just ask Claude in plain English:

- *"Stitch these three clips together and add this voiceover and music track"*
- *"Trim the first 2 seconds off video.mp4 and re-encode at 1080p"*
- *"Extract a still frame at 0:05 as thumbnail.jpg"*
- *"Mix voice.mp3 over bgm.mp3, duck the music when the voice is talking"*
- *"Burn captions.srt into this video with a bold yellow font"*
- *"Convert this .mov to a 9:16 vertical mp4 for Instagram Reels"*
- *"Run ffprobe on output.mp4 and tell me if it's broken"*

Under the hood, Claude downloads the inputs, writes the ffmpeg command, runs it via `shell_run`, and reports the result.

### Example: stitch three clips with audio passthrough

```ts
// 1. Pull the inputs to local disk
await download({ url: "https://example.com/seg-A.mp4", destPath: "myvideo/seg-A.mp4" });
await download({ url: "https://example.com/seg-B.mp4", destPath: "myvideo/seg-B.mp4" });
await download({ url: "https://example.com/seg-C.mp4", destPath: "myvideo/seg-C.mp4" });

// 2. Run ffmpeg (Claude writes the full command)
await shell_run({
  command: `ffmpeg \\
    -i seg-A.mp4 -i seg-B.mp4 -i seg-C.mp4 \\
    -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a] concat=n=3:v=1:a=1 [outv][outa]" \\
    -map "[outv]" -map "[outa]" \\
    -c:v libx264 -crf 18 -c:a aac -b:a 192k -movflags +faststart \\
    final.mp4`,
  workdir: "myvideo",
  timeoutSec: 600
});
```

`final.mp4` lands in your configured working directory.

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

By [mrdainami](https://github.com/mrdainami). PRs and issues welcome.
