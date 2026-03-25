import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadGroups,
  searchMessages,
  getRecentMessages,
  getGroupMessages,
  getStats,
  getHotTopics,
  getContextAroundMessage,
  getSenderActivity,
} from "./sheets.js";

const server = new McpServer({
  name: "wechat-gsheet-mcp",
  version: "1.0.0",
});

// ── 1. list_groups ──

server.tool(
  "list_groups",
  "列出所有监控的微信群组及成员数",
  {},
  async () => {
    const groups = await loadGroups();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(groups, null, 2),
        },
      ],
    };
  }
);

// ── 2. search_messages ──

server.tool(
  "search_messages",
  "按关键词搜索微信聊天记录，支持按群组和时间范围过滤",
  {
    keyword: z.string().describe("搜索关键词"),
    group_name: z.string().optional().describe("限定群组名（模糊匹配）"),
    hours: z.number().optional().describe("限定最近N小时内的消息"),
    limit: z.number().optional().describe("返回条数上限，默认100"),
  },
  async ({ keyword, group_name, hours, limit }) => {
    const results = await searchMessages(keyword, { group_name, hours, limit });
    return {
      content: [
        {
          type: "text",
          text:
            `找到 ${results.length} 条相关消息：\n\n` +
            JSON.stringify(results, null, 2),
        },
      ],
    };
  }
);

// ── 3. get_recent_messages ──

server.tool(
  "get_recent_messages",
  "获取最近N小时内的聊天记录，可按群组过滤。适合做24小时摘要/总结",
  {
    hours: z.number().optional().describe("时间范围（小时），默认24"),
    group_name: z.string().optional().describe("限定群组名（模糊匹配）"),
  },
  async ({ hours, group_name }) => {
    const h = hours ?? 24;
    const messages = await getRecentMessages(h, group_name);
    return {
      content: [
        {
          type: "text",
          text:
            `最近 ${h} 小时共 ${messages.length} 条消息：\n\n` +
            JSON.stringify(messages, null, 2),
        },
      ],
    };
  }
);

// ── 4. get_group_messages ──

server.tool(
  "get_group_messages",
  "获取指定群组的最新聊天记录",
  {
    group_name: z.string().describe("群组名称（模糊匹配）"),
    limit: z.number().optional().describe("返回条数上限，默认200"),
  },
  async ({ group_name, limit }) => {
    const messages = await getGroupMessages(group_name, limit);
    return {
      content: [
        {
          type: "text",
          text:
            `群「${group_name}」最新 ${messages.length} 条消息：\n\n` +
            JSON.stringify(messages, null, 2),
        },
      ],
    };
  }
);

// ── 5. get_stats ──

server.tool(
  "get_stats",
  "获取各群组的活跃度统计：消息数、活跃人数、发言排名、消息类型分布",
  {
    hours: z.number().optional().describe("统计最近N小时，默认24"),
  },
  async ({ hours }) => {
    const h = hours ?? 24;
    const stats = await getStats(h);
    return {
      content: [
        {
          type: "text",
          text:
            `最近 ${h} 小时各群活跃度统计：\n\n` +
            JSON.stringify(stats, null, 2),
        },
      ],
    };
  }
);

// ── 6. get_hot_topics ──

server.tool(
  "get_hot_topics",
  "分析最近聊天中的高频热词/热点话题，基于词频统计",
  {
    hours: z.number().optional().describe("分析最近N小时，默认24"),
    group_name: z.string().optional().describe("限定群组名"),
  },
  async ({ hours, group_name }) => {
    const h = hours ?? 24;
    const topics = await getHotTopics(h, group_name);
    return {
      content: [
        {
          type: "text",
          text:
            `最近 ${h} 小时热门话题（词频≥5）：\n\n` +
            JSON.stringify(topics, null, 2),
        },
      ],
    };
  }
);

// ── 7. get_message_context ──

server.tool(
  "get_message_context",
  "获取某条消息的上下文（前后N条同群消息），用于理解对话脉络",
  {
    message_id: z.string().describe("消息ID"),
    context_size: z.number().optional().describe("前后各取多少条，默认10"),
  },
  async ({ message_id, context_size }) => {
    const ctx = await getContextAroundMessage(message_id, context_size);
    if (ctx.length === 0) {
      return { content: [{ type: "text" as const, text: "未找到该消息ID" }] };
    }
    return {
      content: [
        {
          type: "text",
          text:
            `消息上下文（共 ${ctx.length} 条）：\n\n` +
            JSON.stringify(ctx, null, 2),
        },
      ],
    };
  }
);

// ── 8. get_sender_activity ──

server.tool(
  "get_sender_activity",
  "查看某个发言人的发言记录和活跃群组",
  {
    sender_name: z.string().describe("发言人名称（模糊匹配）"),
    hours: z.number().optional().describe("限定最近N小时"),
    limit: z.number().optional().describe("返回条数上限，默认100"),
  },
  async ({ sender_name, hours, limit }) => {
    const result = await getSenderActivity(sender_name, { hours, limit });
    return {
      content: [
        {
          type: "text",
          text:
            `「${sender_name}」共 ${result.message_count} 条发言，活跃于 ${result.groups.length} 个群：${result.groups.join("、")}\n\n` +
            JSON.stringify(result.messages, null, 2),
        },
      ],
    };
  }
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
