# Openchat-MCP

MCP server for querying WeChat group chat logs. Search messages, view group activity, get summaries — all from Claude Code or OpenClaw.

Data source: Google Sheets (updated every 12 hours).

## Quick Start (npx, no install needed)

Add to your Claude Code MCP config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "openchat": {
      "command": "npx",
      "args": ["-y", "github:RayIsCoing/Openchat-MCP"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

That's it. No clone, no build — `npx` handles everything automatically.

## Alternative: Clone & Run Locally

```bash
git clone https://github.com/RayIsCoing/Openchat-MCP.git
cd Openchat-MCP
npm install
```

Then add to your MCP config:

```json
{
  "mcpServers": {
    "openchat": {
      "command": "node",
      "args": ["/path/to/Openchat-MCP/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Get API Key

Contact the data provider for access.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_groups` | 列出所有监控的微信群组 |
| `search_messages` | 关键词搜索聊天记录（支持群组/时间过滤） |
| `get_recent_messages` | 获取最近 N 小时消息，适合做摘要总结 |
| `get_group_messages` | 查看某个群的最新聊天记录 |
| `get_stats` | 各群活跃度统计、发言人排名 |
| `get_hot_topics` | 热门话题/高频词分析 |
| `get_message_context` | 查看某条消息的上下文对话 |
| `get_sender_activity` | 查看某人的发言记录 |

## Example Usage

In Claude Code, just ask naturally:

- "帮我总结一下最近24小时各群的讨论热点"
- "搜索关于 BTC 的讨论"
- "看看XX群最近在聊什么"
- "分析一下最活跃的群和发言人"
