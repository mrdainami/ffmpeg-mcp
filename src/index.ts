#!/usr/bin/env node
/**
 * @dainami/ffmpeg-mcp
 *
 * Minimal MCP server: download files + run shell commands. No recipes baked in.
 * The agent constructs the ffmpeg command (from its knowledge files) and this
 * tool executes it locally.
 *
 * Tools:
 *   download(url, destPath)         — fetch a URL to disk
 *   shell_run(command, workdir)     — run a shell command (typically ffmpeg / ffprobe)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { fetch as undiciFetch } from "undici";

// Explicit fetch import — some MCP host runtimes (notably Claude Cowork) don't
// expose Node's global `fetch`. Falling back to undici (which powers global
// fetch under the hood) keeps `download` portable across hosts.
const fetchImpl: typeof globalThis.fetch =
  (globalThis as { fetch?: typeof globalThis.fetch }).fetch ??
  (undiciFetch as unknown as typeof globalThis.fetch);

const WORKDIR_ROOT = (() => {
  const env = process.env.FFMPEG_MCP_WORKDIR;
  if (!env) return process.cwd();
  if (env.startsWith("~")) return env.replace(/^~/, homedir());
  return env;
})();

// Resolve bundled binary paths. ffmpeg-static exports the binary path as default
// (string), ffprobe-static exports an object with a .path field.
const FFMPEG_BIN: string | null = (ffmpegStatic as unknown as string | null) ?? null;
const FFPROBE_BIN: string | null = (ffprobeStatic as { path?: string } | null)?.path ?? null;

// Directories we prepend to PATH so that bare `ffmpeg` / `ffprobe` invocations in
// shell_run resolve to the bundled binaries — no system install required.
const BUNDLED_BIN_DIRS: string[] = [FFMPEG_BIN, FFPROBE_BIN]
  .filter((p): p is string => Boolean(p))
  .map((p) => dirname(p));

function envWithBundledBinaries(): NodeJS.ProcessEnv {
  if (BUNDLED_BIN_DIRS.length === 0) return process.env;
  const currentPath = process.env.PATH ?? "";
  return {
    ...process.env,
    PATH: [...BUNDLED_BIN_DIRS, currentPath].filter(Boolean).join(delimiter),
  };
}

function resolveWorkdir(p?: string): string {
  if (!p) return WORKDIR_ROOT;
  if (p.startsWith("~")) {
    const expanded = p.replace(/^~/, homedir());
    return isAbsolute(expanded) ? expanded : resolve(WORKDIR_ROOT, expanded);
  }
  return isAbsolute(p) ? p : resolve(WORKDIR_ROOT, p);
}

type ShellArgs = {
  command: string;
  workdir?: string;
  timeoutSec?: number;
};

type ShellResult = {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  cwd: string;
  command: string;
  timedOut: boolean;
};

async function shellRun(args: ShellArgs): Promise<ShellResult> {
  const cwd = resolveWorkdir(args.workdir);
  await mkdir(cwd, { recursive: true });
  const timeoutMs = (args.timeoutSec ?? 1800) * 1000;

  return await new Promise<ShellResult>((resolveP) => {
    const start = Date.now();
    const child = spawn(args.command, {
      cwd,
      shell: true,
      env: envWithBundledBinaries(),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on("data", (d: Buffer) => stderrChunks.push(d));

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveP({
        ok: !timedOut && code === 0,
        exitCode: code,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs: Date.now() - start,
        cwd,
        command: args.command,
        timedOut,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolveP({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${err.message}\n${Buffer.concat(stderrChunks).toString("utf8")}`,
        durationMs: Date.now() - start,
        cwd,
        command: args.command,
        timedOut,
      });
    });
  });
}

type DownloadArgs = {
  url: string;
  destPath: string;
};

async function downloadFile(args: DownloadArgs) {
  const dest = resolveWorkdir(args.destPath);
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetchImpl(args.url);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      url: args.url,
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return { ok: true, path: dest, bytes: buf.length, url: args.url };
}

const server = new Server(
  { name: "dainami-ffmpeg-mcp", version: "0.1.3" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "shell_run",
      description:
        "Run a shell command locally. Primary use: ffmpeg invocations to compose video segments + audio + end-card into a final mp4. The agent writes the full command (per your knowledge/07-compose.md recipes); this tool just executes it and returns exit code, stdout, stderr, duration. Default timeout 30 min. Note: runs with shell:true so heredocs, pipes, and redirects all work.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "Full shell command. ffmpeg / ffprobe / curl / mkdir / mv / etc. Multi-line OK.",
          },
          workdir: {
            type: "string",
            description:
              "Working directory. Absolute, or relative to FFMPEG_MCP_WORKDIR. `~/...` expands. Created if missing.",
          },
          timeoutSec: {
            type: "number",
            description: "Kill the process after this many seconds. Default 1800 (30 min).",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
    {
      name: "download",
      description:
        "Download a file from a URL to local disk. Use this before ffmpeg to pull R2 / Google Drive / KIE-hosted segment mp4s and audio onto the machine so ffmpeg can read them.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Source URL. Must be publicly accessible (no auth headers supported in v1).",
          },
          destPath: {
            type: "string",
            description:
              "Destination file path. Absolute, or relative to FFMPEG_MCP_WORKDIR. Parent directories are created.",
          },
        },
        required: ["url", "destPath"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs } = req.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  try {
    if (name === "shell_run") {
      const result = await shellRun(args as unknown as ShellArgs);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "download") {
      const result = await downloadFile(args as unknown as DownloadArgs);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[dainami-ffmpeg-mcp] running on stdio — workdir ${WORKDIR_ROOT}`);
console.error(`[dainami-ffmpeg-mcp] bundled ffmpeg:  ${FFMPEG_BIN ?? "NOT FOUND"}`);
console.error(`[dainami-ffmpeg-mcp] bundled ffprobe: ${FFPROBE_BIN ?? "NOT FOUND"}`);
