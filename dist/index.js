#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// src/sheets.ts
import { google } from "googleapis";
var SPREADSHEET_ID = process.env.SPREADSHEET_ID || "1zzdRNCEXyaOLdAN0jrFjjjlgFwvkjnOznTVD1PafcwM";
var MESSAGES_SHEET = "\u6D88\u606F";
var GROUPS_SHEET = "\u7FA4\u7EC4";
var CACHE_TTL_MS = 15 * 60 * 1e3;
var messagesCache = null;
var groupsCache = null;
function getSheets() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY environment variable is required");
  return google.sheets({ version: "v4", auth: apiKey });
}
function isStale(cache) {
  return !cache || Date.now() - cache.loaded_at > CACHE_TTL_MS;
}
async function loadMessages(forceRefresh = false) {
  if (!forceRefresh && !isStale(messagesCache)) return messagesCache.data;
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${MESSAGES_SHEET}!A2:H`
  });
  const rows = res.data.values ?? [];
  const messages = rows.map((r) => ({
    message_id: r[0] ?? "",
    group_id: r[1] ?? "",
    sender_id: r[2] ?? "",
    sender_name: r[3] ?? "\u672A\u77E5",
    timestamp: r[4] ?? "",
    content: r[5] ?? "",
    group_name: r[6] ?? "\u672A\u77E5\u7FA4\u804A",
    msg_type: r[7] ?? "text"
  }));
  messagesCache = { data: messages, loaded_at: Date.now() };
  return messages;
}
async function loadGroups(forceRefresh = false) {
  if (!forceRefresh && !isStale(groupsCache)) return groupsCache.data;
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${GROUPS_SHEET}!A2:C`
  });
  const rows = res.data.values ?? [];
  const groups = rows.map((r) => ({
    group_id: r[0] ?? "",
    group_name: r[1] ?? "",
    member_count: parseInt(r[2] ?? "0", 10) || 0
  }));
  groupsCache = { data: groups, loaded_at: Date.now() };
  return groups;
}
async function searchMessages(keyword, opts = {}) {
  const all = await loadMessages();
  const kw = keyword.toLowerCase();
  const cutoff = opts.hours ? Date.now() - opts.hours * 36e5 : 0;
  let results = all.filter((m) => {
    if (!m.content.toLowerCase().includes(kw)) return false;
    if (opts.group_name && !m.group_name.includes(opts.group_name)) return false;
    if (cutoff && new Date(m.timestamp).getTime() < cutoff) return false;
    return true;
  });
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return results.slice(0, opts.limit ?? 100);
}
async function getRecentMessages(hours = 24, groupName) {
  const all = await loadMessages();
  const cutoff = Date.now() - hours * 36e5;
  let results = all.filter((m) => {
    const ts = new Date(m.timestamp).getTime();
    if (ts < cutoff) return false;
    if (groupName && !m.group_name.includes(groupName)) return false;
    return true;
  });
  results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return results;
}
async function getGroupMessages(groupName, limit = 200) {
  const all = await loadMessages();
  const results = all.filter((m) => m.group_name.includes(groupName)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  return results;
}
async function getStats(hours = 24) {
  const messages = await getRecentMessages(hours);
  const byGroup = /* @__PURE__ */ new Map();
  for (const m of messages) {
    const arr = byGroup.get(m.group_name) || [];
    arr.push(m);
    byGroup.set(m.group_name, arr);
  }
  const stats = [];
  for (const [groupName, msgs] of byGroup) {
    const senderCounts = /* @__PURE__ */ new Map();
    const typeCounts = {};
    for (const m of msgs) {
      senderCounts.set(m.sender_name, (senderCounts.get(m.sender_name) || 0) + 1);
      typeCounts[m.msg_type] = (typeCounts[m.msg_type] || 0) + 1;
    }
    const topSenders = [...senderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    const sorted = msgs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    stats.push({
      group_name: groupName,
      message_count: msgs.length,
      active_users: senderCounts.size,
      top_senders: topSenders,
      latest_message_time: sorted[0]?.timestamp ?? "",
      msg_type_breakdown: typeCounts
    });
  }
  stats.sort((a, b) => b.message_count - a.message_count);
  return stats;
}
async function getHotTopics(hours = 24, groupName) {
  const messages = await getRecentMessages(hours, groupName);
  const textMsgs = messages.filter((m) => m.msg_type === "text" && m.content.length > 1);
  const phraseCount = /* @__PURE__ */ new Map();
  for (const m of textMsgs) {
    const content = m.content;
    if (content.length < 4) continue;
    const seen = /* @__PURE__ */ new Set();
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= content.length - len; i++) {
        const seg = content.substring(i, i + len);
        if (/^[\s\d\p{P}]+$/u.test(seg)) continue;
        if (seen.has(seg)) continue;
        seen.add(seg);
        const entry = phraseCount.get(seg) || { count: 0, samples: [] };
        entry.count++;
        if (entry.samples.length < 3) {
          entry.samples.push(`${m.sender_name}: ${content.substring(0, 80)}`);
        }
        phraseCount.set(seg, entry);
      }
    }
  }
  return [...phraseCount.entries()].filter(([, v]) => v.count >= 5).sort((a, b) => b[1].count - a[1].count).slice(0, 30).map(([keyword, v]) => ({
    keyword,
    count: v.count,
    sample_messages: v.samples
  }));
}
async function getContextAroundMessage(messageId, contextSize = 10) {
  const all = await loadMessages();
  const idx = all.findIndex((m) => m.message_id === messageId);
  if (idx === -1) return [];
  const groupName = all[idx].group_name;
  const groupMsgs = all.filter((m) => m.group_name === groupName);
  const gIdx = groupMsgs.findIndex((m) => m.message_id === messageId);
  const start = Math.max(0, gIdx - contextSize);
  const end = Math.min(groupMsgs.length, gIdx + contextSize + 1);
  return groupMsgs.slice(start, end);
}
async function getSenderActivity(senderName, opts = {}) {
  const all = await loadMessages();
  const cutoff = opts.hours ? Date.now() - opts.hours * 36e5 : 0;
  const messages = all.filter((m) => {
    if (!m.sender_name.includes(senderName)) return false;
    if (cutoff && new Date(m.timestamp).getTime() < cutoff) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, opts.limit ?? 100);
  const groups = [...new Set(messages.map((m) => m.group_name))];
  return { messages, groups, message_count: messages.length };
}

// src/index.ts
var server = new McpServer({
  name: "wechat-gsheet-mcp",
  version: "1.0.0"
});
server.tool(
  "list_groups",
  "\u5217\u51FA\u6240\u6709\u76D1\u63A7\u7684\u5FAE\u4FE1\u7FA4\u7EC4\u53CA\u6210\u5458\u6570",
  {},
  async () => {
    const groups = await loadGroups();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(groups, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "search_messages",
  "\u6309\u5173\u952E\u8BCD\u641C\u7D22\u5FAE\u4FE1\u804A\u5929\u8BB0\u5F55\uFF0C\u652F\u6301\u6309\u7FA4\u7EC4\u548C\u65F6\u95F4\u8303\u56F4\u8FC7\u6EE4",
  {
    keyword: z.string().describe("\u641C\u7D22\u5173\u952E\u8BCD"),
    group_name: z.string().optional().describe("\u9650\u5B9A\u7FA4\u7EC4\u540D\uFF08\u6A21\u7CCA\u5339\u914D\uFF09"),
    hours: z.number().optional().describe("\u9650\u5B9A\u6700\u8FD1N\u5C0F\u65F6\u5185\u7684\u6D88\u606F"),
    limit: z.number().optional().describe("\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4100")
  },
  async ({ keyword, group_name, hours, limit }) => {
    const results = await searchMessages(keyword, { group_name, hours, limit });
    return {
      content: [
        {
          type: "text",
          text: `\u627E\u5230 ${results.length} \u6761\u76F8\u5173\u6D88\u606F\uFF1A

` + JSON.stringify(results, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_recent_messages",
  "\u83B7\u53D6\u6700\u8FD1N\u5C0F\u65F6\u5185\u7684\u804A\u5929\u8BB0\u5F55\uFF0C\u53EF\u6309\u7FA4\u7EC4\u8FC7\u6EE4\u3002\u9002\u5408\u505A24\u5C0F\u65F6\u6458\u8981/\u603B\u7ED3",
  {
    hours: z.number().optional().describe("\u65F6\u95F4\u8303\u56F4\uFF08\u5C0F\u65F6\uFF09\uFF0C\u9ED8\u8BA424"),
    group_name: z.string().optional().describe("\u9650\u5B9A\u7FA4\u7EC4\u540D\uFF08\u6A21\u7CCA\u5339\u914D\uFF09")
  },
  async ({ hours, group_name }) => {
    const h = hours ?? 24;
    const messages = await getRecentMessages(h, group_name);
    return {
      content: [
        {
          type: "text",
          text: `\u6700\u8FD1 ${h} \u5C0F\u65F6\u5171 ${messages.length} \u6761\u6D88\u606F\uFF1A

` + JSON.stringify(messages, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_group_messages",
  "\u83B7\u53D6\u6307\u5B9A\u7FA4\u7EC4\u7684\u6700\u65B0\u804A\u5929\u8BB0\u5F55",
  {
    group_name: z.string().describe("\u7FA4\u7EC4\u540D\u79F0\uFF08\u6A21\u7CCA\u5339\u914D\uFF09"),
    limit: z.number().optional().describe("\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4200")
  },
  async ({ group_name, limit }) => {
    const messages = await getGroupMessages(group_name, limit);
    return {
      content: [
        {
          type: "text",
          text: `\u7FA4\u300C${group_name}\u300D\u6700\u65B0 ${messages.length} \u6761\u6D88\u606F\uFF1A

` + JSON.stringify(messages, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_stats",
  "\u83B7\u53D6\u5404\u7FA4\u7EC4\u7684\u6D3B\u8DC3\u5EA6\u7EDF\u8BA1\uFF1A\u6D88\u606F\u6570\u3001\u6D3B\u8DC3\u4EBA\u6570\u3001\u53D1\u8A00\u6392\u540D\u3001\u6D88\u606F\u7C7B\u578B\u5206\u5E03",
  {
    hours: z.number().optional().describe("\u7EDF\u8BA1\u6700\u8FD1N\u5C0F\u65F6\uFF0C\u9ED8\u8BA424")
  },
  async ({ hours }) => {
    const h = hours ?? 24;
    const stats = await getStats(h);
    return {
      content: [
        {
          type: "text",
          text: `\u6700\u8FD1 ${h} \u5C0F\u65F6\u5404\u7FA4\u6D3B\u8DC3\u5EA6\u7EDF\u8BA1\uFF1A

` + JSON.stringify(stats, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_hot_topics",
  "\u5206\u6790\u6700\u8FD1\u804A\u5929\u4E2D\u7684\u9AD8\u9891\u70ED\u8BCD/\u70ED\u70B9\u8BDD\u9898\uFF0C\u57FA\u4E8E\u8BCD\u9891\u7EDF\u8BA1",
  {
    hours: z.number().optional().describe("\u5206\u6790\u6700\u8FD1N\u5C0F\u65F6\uFF0C\u9ED8\u8BA424"),
    group_name: z.string().optional().describe("\u9650\u5B9A\u7FA4\u7EC4\u540D")
  },
  async ({ hours, group_name }) => {
    const h = hours ?? 24;
    const topics = await getHotTopics(h, group_name);
    return {
      content: [
        {
          type: "text",
          text: `\u6700\u8FD1 ${h} \u5C0F\u65F6\u70ED\u95E8\u8BDD\u9898\uFF08\u8BCD\u9891\u22655\uFF09\uFF1A

` + JSON.stringify(topics, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_message_context",
  "\u83B7\u53D6\u67D0\u6761\u6D88\u606F\u7684\u4E0A\u4E0B\u6587\uFF08\u524D\u540EN\u6761\u540C\u7FA4\u6D88\u606F\uFF09\uFF0C\u7528\u4E8E\u7406\u89E3\u5BF9\u8BDD\u8109\u7EDC",
  {
    message_id: z.string().describe("\u6D88\u606FID"),
    context_size: z.number().optional().describe("\u524D\u540E\u5404\u53D6\u591A\u5C11\u6761\uFF0C\u9ED8\u8BA410")
  },
  async ({ message_id, context_size }) => {
    const ctx = await getContextAroundMessage(message_id, context_size);
    if (ctx.length === 0) {
      return { content: [{ type: "text", text: "\u672A\u627E\u5230\u8BE5\u6D88\u606FID" }] };
    }
    return {
      content: [
        {
          type: "text",
          text: `\u6D88\u606F\u4E0A\u4E0B\u6587\uFF08\u5171 ${ctx.length} \u6761\uFF09\uFF1A

` + JSON.stringify(ctx, null, 2)
        }
      ]
    };
  }
);
server.tool(
  "get_sender_activity",
  "\u67E5\u770B\u67D0\u4E2A\u53D1\u8A00\u4EBA\u7684\u53D1\u8A00\u8BB0\u5F55\u548C\u6D3B\u8DC3\u7FA4\u7EC4",
  {
    sender_name: z.string().describe("\u53D1\u8A00\u4EBA\u540D\u79F0\uFF08\u6A21\u7CCA\u5339\u914D\uFF09"),
    hours: z.number().optional().describe("\u9650\u5B9A\u6700\u8FD1N\u5C0F\u65F6"),
    limit: z.number().optional().describe("\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4100")
  },
  async ({ sender_name, hours, limit }) => {
    const result = await getSenderActivity(sender_name, { hours, limit });
    return {
      content: [
        {
          type: "text",
          text: `\u300C${sender_name}\u300D\u5171 ${result.message_count} \u6761\u53D1\u8A00\uFF0C\u6D3B\u8DC3\u4E8E ${result.groups.length} \u4E2A\u7FA4\uFF1A${result.groups.join("\u3001")}

` + JSON.stringify(result.messages, null, 2)
        }
      ]
    };
  }
);
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
