# wechat-gsheet-mcp

MCP server for querying WeChat group chat logs. Search messages, view group activity, get summaries — all from Claude Code or OpenClaw.

Data source: Google Sheets (updated every 12 hours).

## Setup

### 1. Get API Key

Ask the data provider for the Google API Key.

### 2. Add to Claude Code

Add to your Claude Code MCP config (`~/.claude.json` or project settings):

```json
{
  "mcpServers": {
    "wechat-chat": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/wechat-gsheet-mcp/src/index.ts"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Or if you build first (`npm run build`):

```json
{
  "mcpServers": {
    "wechat-chat": {
      "command": "node",
      "args": ["/path/to/wechat-gsheet-mcp/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

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
