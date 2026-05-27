# @dainami/ffmpeg-mcp

> Let Claude **edit, compose, and transcode video and audio** locally with ffmpeg — trim clips, stitch segments, mix voiceover with music, burn captions, generate thumbnails, extract frames, anything ffmpeg can do.

A tiny MCP server with two tools: `download` (pull a remote video / audio file to local disk) and `shell_run` (run any local shell command). Claude writes the actual ffmpeg command from chat using its knowledge of ffmpeg — this just executes it.

No recipes baked in. No DSL to learn. Tell Claude what you want done to a video, it figures out the ffmpeg invocation, and this runs it.

---

## ⚠️ Security note

`shell_run` executes **arbitrary shell commands** as your user. Only install this MCP if you trust the agent driving it. If you want a safer compose path, set `FFMPEG_MCP_WORKDIR` to a sandbox folder so relative paths stay there (absolute paths still escape it).

---

## Which install do I need?

Pick the row that matches how you run Claude:

- **Claude Code (terminal)** → use **Quick start: Claude Code** below — one command, the fastest option.
- **Regular Claude Desktop chat** → use **Path A** (drag-and-drop `.mcpb`, 2 minutes, no terminal).
- **Claude Desktop co-work** → use **Path B** (download source, build once, edit a config file). Co-work ignores `.mcpb` files, so you set it up by hand.

If you use both Desktop modes, do Path B — it works for both.

> **ffmpeg itself must be installed on your machine first** (this MCP just runs ffmpeg commands; it doesn't ship the binary).
> - **macOS:** `brew install ffmpeg`
> - **Linux:** `sudo apt install ffmpeg`
> - **Windows:** download from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to your PATH.

---

## Quick start: Claude Code (fastest)

One command — no `.mcpb`, no JSON editing. (Make sure `ffmpeg` is installed first — see the box above.)

1. **Clone + build** (once, somewhere permanent):

   ```bash
   git clone https://github.com/mrdainami/ffmpeg-mcp.git ~/mcp/ffmpeg-mcp
   cd ~/mcp/ffmpeg-mcp && npm install && npm run build
   ```

2. **Register it** (`FFMPEG_MCP_WORKDIR` is where downloads + outputs land; `--scope user` makes it available in every project):

   ```bash
   claude mcp add --scope user ffmpeg --env FFMPEG_MCP_WORKDIR=~/ffmpeg-work -- node ~/mcp/ffmpeg-mcp/dist/index.js
   ```

3. **Verify:** `claude mcp list` should show `ffmpeg  ✓ Connected`.

To update later: `git pull && npm run build` in the folder, then restart Claude Code.

---

## Path A — Regular Claude Desktop (drag-and-drop)

1. **Download the latest `.mcpb`** from the [releases page](https://github.com/mrdainami/ffmpeg-mcp/releases).
2. **Drag that file onto the Claude Desktop window** (or open Settings → Extensions and pick it).
3. When prompted, pick a working directory — files downloaded by the agent and ffmpeg outputs land here. Something like `~/Documents/ffmpeg-work` is fine.
4. **Quit Claude Desktop fully and reopen it.**

To verify: open a chat → click **+** → **Connectors** → "ffmpeg (local shell)" should appear with 2 tools.

> **Why `.mcpb`?** It's Anthropic's drag-and-drop install format for local MCP servers. No JSON editing, no Node.js install required (Claude Desktop bundles its own Node runtime). [Read more →](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

---

## Path B — Claude co-work (manual install)

Co-work doesn't load `.mcpb` files. You have to install Node.js, download this repo, build it once, then point Claude at the built file via the config JSON. One-time setup, ~10 minutes.

### 1. Install Node.js

If you don't have it: go to [nodejs.org](https://nodejs.org) → click the big **LTS** download button → run the installer → click Next a few times.

### 2. Download this repo and build it

You only do this once. The folder you create here is **permanent** — Claude will look at it forever, so put it somewhere you won't move or delete (`~/Documents/ffmpeg-mcp` is a good spot).

- Go to [github.com/mrdainami/ffmpeg-mcp](https://github.com/mrdainami/ffmpeg-mcp)
- Click the green **Code** button → **Download ZIP**
- Unzip it. Rename `ffmpeg-mcp-main` to `ffmpeg-mcp` and put it in `~/Documents/`.
- Open **Terminal** (Spotlight → "Terminal") and run these, one at a time:

  ```bash
  cd ~/Documents/ffmpeg-mcp
  npm install
  npm run build
  ```

  After `npm run build` finishes, close Terminal and never open it again.

### 3. Pick a working directory

This is the folder where the agent will download videos and where ffmpeg will write outputs. Make one now, e.g. `~/Documents/ffmpeg-work`.

### 4. Tell Claude where to find it

- In Finder, press **Cmd+Shift+G** and paste:

  ```
  ~/Library/Application Support/Claude/
  ```

- Open `claude_desktop_config.json` in any text editor.
- If the file is empty, paste the whole block below. If it already has stuff, just add the `"ffmpeg": { ... }` block inside the existing `"mcpServers"` object:

  ```json
  {
    "mcpServers": {
      "ffmpeg": {
        "command": "node",
        "args": [
          "/Users/YOUR_USERNAME/Documents/ffmpeg-mcp/dist/index.js"
        ],
        "env": {
          "FFMPEG_MCP_WORKDIR": "/Users/YOUR_USERNAME/Documents/ffmpeg-work"
        }
      }
    }
  }
  ```

- Replace `YOUR_USERNAME` with your Mac username (run `whoami` in Terminal if you don't know).
- Save the file. **Quit Claude Desktop fully and reopen it.**

On Windows, the config file lives at `%APPDATA%\Claude\claude_desktop_config.json` with Windows-style paths in `args` and `FFMPEG_MCP_WORKDIR`.

### 5. Try it

In co-work, ask: *"Trim the first 2 seconds off this video and re-encode at 1080p: https://example.com/video.mp4"*. Claude will download the file into your workdir, run ffmpeg, and drop the output there too.

**If something goes wrong:**
- "command not found: npm" → Node.js isn't installed. Redo step 1.
- "module not found" / "ENOENT dist/index.js" → you skipped `npm run build` in step 2.
- "ffmpeg: command not found" → install ffmpeg itself (see the box above).
- Tool calls hang forever → check the workdir path in `FFMPEG_MCP_WORKDIR` actually exists.

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
