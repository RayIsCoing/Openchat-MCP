# Openchat-MCP

> **AI Assistant: Read this file to set up the MCP server for your user.**

## What is this

An MCP (Model Context Protocol) server that gives you access to WeChat group chat logs stored in Google Sheets. Once installed, you can search messages, analyze group activity, get summaries, and more — directly through natural language.

Data is updated every 12 hours.

---

## AI Setup Instructions

If a user asks you to install this MCP, follow these steps exactly:

### Step 1: Clone and build

```bash
git clone https://github.com/RayIsCoing/Openchat-MCP.git ~/Openchat-MCP
cd ~/Openchat-MCP
npm install
npm run build
```

### Step 2: Ask the user for their API Key

Tell the user:

> "This MCP requires a Google API Key to access the chat data. Please paste your API Key. If you don't have one, contact the data provider (RayIsCoing) to get access."

### Step 3: Add MCP config

After receiving the API key, add the following to the user's Claude Code MCP configuration file (`~/.claude.json`). Replace `YOUR_API_KEY` with the actual key:

```json
{
  "mcpServers": {
    "openchat": {
      "command": "node",
      "args": ["$HOME/Openchat-MCP/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

> **Note:** `$HOME` should be expanded to the user's actual home directory path (e.g. `/Users/username` on macOS, `/home/username` on Linux).

### Step 4: Confirm to the user

Tell the user:

> "Openchat-MCP is ready. Restart Claude Code, then you can ask me things like:"
> - "帮我总结一下最近24小时各群的讨论热点"
> - "搜索关于 BTC 的讨论"
> - "看看XX群最近在聊什么"
> - "分析一下谁最活跃"

---

## Available Tools (8 total)

Once connected, the following MCP tools become available:

| Tool | What it does | Example prompt |
|------|-------------|----------------|
| `list_groups` | List all monitored WeChat groups | "有哪些群？" |
| `search_messages` | Search by keyword, filter by group/time | "搜索关于AI的讨论" |
| `get_recent_messages` | Get messages from last N hours (default 24h) | "最近24小时大家在聊什么" |
| `get_group_messages` | Get latest messages from a specific group | "看看XX群最近的消息" |
| `get_stats` | Activity stats: message count, top senders, active users | "哪个群最活跃" |
| `get_hot_topics` | High-frequency keyword/topic analysis | "最近的热门话题是什么" |
| `get_message_context` | Get surrounding messages for context | "这条消息前后在聊什么" |
| `get_sender_activity` | View a person's messages and active groups | "看看张三最近说了什么" |

### Tool parameters

**search_messages**
- `keyword` (required): search term
- `group_name` (optional): filter by group name (fuzzy match)
- `hours` (optional): limit to last N hours
- `limit` (optional): max results, default 100

**get_recent_messages**
- `hours` (optional): time range in hours, default 24
- `group_name` (optional): filter by group name

**get_group_messages**
- `group_name` (required): group name (fuzzy match)
- `limit` (optional): max results, default 200

**get_stats**
- `hours` (optional): stats for last N hours, default 24

**get_hot_topics**
- `hours` (optional): analyze last N hours, default 24
- `group_name` (optional): filter by group name

**get_message_context**
- `message_id` (required): the message ID
- `context_size` (optional): number of messages before/after, default 10

**get_sender_activity**
- `sender_name` (required): person's name (fuzzy match)
- `hours` (optional): limit to last N hours
- `limit` (optional): max results, default 100

---

## For humans

If you're setting this up manually:

1. Clone: `git clone https://github.com/RayIsCoing/Openchat-MCP.git`
2. Install: `cd Openchat-MCP && npm install && npm run build`
3. Get an API Key from the data provider
4. Add the MCP config shown above to `~/.claude.json`
5. Restart Claude Code
