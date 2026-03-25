import { google } from "googleapis";

const SPREADSHEET_ID =
  process.env.SPREADSHEET_ID || "1zzdRNCEXyaOLdAN0jrFjjjlgFwvkjnOznTVD1PafcwM";
const MESSAGES_SHEET = "消息";
const GROUPS_SHEET = "群组";

// Cache: reload every 15 minutes
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface Message {
  message_id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  timestamp: string;
  content: string;
  group_name: string;
  msg_type: string;
}

export interface Group {
  group_id: string;
  group_name: string;
  member_count: number;
}

interface Cache<T> {
  data: T[];
  loaded_at: number;
}

let messagesCache: Cache<Message> | null = null;
let groupsCache: Cache<Group> | null = null;

function getSheets() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY environment variable is required");
  return google.sheets({ version: "v4", auth: apiKey });
}

function isStale<T>(cache: Cache<T> | null): boolean {
  return !cache || Date.now() - cache.loaded_at > CACHE_TTL_MS;
}

export async function loadMessages(forceRefresh = false): Promise<Message[]> {
  if (!forceRefresh && !isStale(messagesCache)) return messagesCache!.data;

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${MESSAGES_SHEET}!A2:H`,
  });

  const rows = res.data.values ?? [];
  const messages: Message[] = rows.map((r) => ({
    message_id: r[0] ?? "",
    group_id: r[1] ?? "",
    sender_id: r[2] ?? "",
    sender_name: r[3] ?? "未知",
    timestamp: r[4] ?? "",
    content: r[5] ?? "",
    group_name: r[6] ?? "未知群聊",
    msg_type: r[7] ?? "text",
  }));

  messagesCache = { data: messages, loaded_at: Date.now() };
  return messages;
}

export async function loadGroups(forceRefresh = false): Promise<Group[]> {
  if (!forceRefresh && !isStale(groupsCache)) return groupsCache!.data;

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${GROUPS_SHEET}!A2:C`,
  });

  const rows = res.data.values ?? [];
  const groups: Group[] = rows.map((r) => ({
    group_id: r[0] ?? "",
    group_name: r[1] ?? "",
    member_count: parseInt(r[2] ?? "0", 10) || 0,
  }));

  groupsCache = { data: groups, loaded_at: Date.now() };
  return groups;
}

// ── Query helpers ──

export async function searchMessages(
  keyword: string,
  opts: { group_name?: string; limit?: number; hours?: number } = {}
): Promise<Message[]> {
  const all = await loadMessages();
  const kw = keyword.toLowerCase();
  const cutoff = opts.hours ? Date.now() - opts.hours * 3600_000 : 0;

  let results = all.filter((m) => {
    if (!m.content.toLowerCase().includes(kw)) return false;
    if (opts.group_name && !m.group_name.includes(opts.group_name)) return false;
    if (cutoff && new Date(m.timestamp).getTime() < cutoff) return false;
    return true;
  });

  // Sort by time descending (newest first)
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return results.slice(0, opts.limit ?? 100);
}

export async function getRecentMessages(
  hours: number = 24,
  groupName?: string
): Promise<Message[]> {
  const all = await loadMessages();
  const cutoff = Date.now() - hours * 3600_000;

  let results = all.filter((m) => {
    const ts = new Date(m.timestamp).getTime();
    if (ts < cutoff) return false;
    if (groupName && !m.group_name.includes(groupName)) return false;
    return true;
  });

  results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return results;
}

export async function getGroupMessages(
  groupName: string,
  limit: number = 200
): Promise<Message[]> {
  const all = await loadMessages();
  const results = all
    .filter((m) => m.group_name.includes(groupName))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
  return results;
}

export interface GroupStats {
  group_name: string;
  message_count: number;
  active_users: number;
  top_senders: { name: string; count: number }[];
  latest_message_time: string;
  msg_type_breakdown: Record<string, number>;
}

export async function getStats(hours: number = 24): Promise<GroupStats[]> {
  const messages = await getRecentMessages(hours);

  const byGroup = new Map<string, Message[]>();
  for (const m of messages) {
    const arr = byGroup.get(m.group_name) || [];
    arr.push(m);
    byGroup.set(m.group_name, arr);
  }

  const stats: GroupStats[] = [];
  for (const [groupName, msgs] of byGroup) {
    const senderCounts = new Map<string, number>();
    const typeCounts: Record<string, number> = {};

    for (const m of msgs) {
      senderCounts.set(m.sender_name, (senderCounts.get(m.sender_name) || 0) + 1);
      typeCounts[m.msg_type] = (typeCounts[m.msg_type] || 0) + 1;
    }

    const topSenders = [...senderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const sorted = msgs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    stats.push({
      group_name: groupName,
      message_count: msgs.length,
      active_users: senderCounts.size,
      top_senders: topSenders,
      latest_message_time: sorted[0]?.timestamp ?? "",
      msg_type_breakdown: typeCounts,
    });
  }

  stats.sort((a, b) => b.message_count - a.message_count);
  return stats;
}

export async function getHotTopics(
  hours: number = 24,
  groupName?: string
): Promise<{ keyword: string; count: number; sample_messages: string[] }[]> {
  const messages = await getRecentMessages(hours, groupName);

  // Extract frequently mentioned words/phrases (simple frequency analysis)
  // Filter only text messages with content
  const textMsgs = messages.filter((m) => m.msg_type === "text" && m.content.length > 1);

  // Bigram + trigram frequency (Chinese text segmentation approximation)
  const phraseCount = new Map<string, { count: number; samples: string[] }>();

  for (const m of textMsgs) {
    const content = m.content;
    // Skip very short or system messages
    if (content.length < 4) continue;

    // Extract 2-4 char segments (rough Chinese "word" extraction)
    const seen = new Set<string>();
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= content.length - len; i++) {
        const seg = content.substring(i, i + len);
        // Skip if contains only punctuation/whitespace/numbers
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

  // Filter: at least 5 mentions, sort by frequency
  return [...phraseCount.entries()]
    .filter(([, v]) => v.count >= 5)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30)
    .map(([keyword, v]) => ({
      keyword,
      count: v.count,
      sample_messages: v.samples,
    }));
}

export async function getContextAroundMessage(
  messageId: string,
  contextSize: number = 10
): Promise<Message[]> {
  const all = await loadMessages();
  const idx = all.findIndex((m) => m.message_id === messageId);
  if (idx === -1) return [];

  const groupName = all[idx].group_name;
  // Get messages in same group
  const groupMsgs = all.filter((m) => m.group_name === groupName);
  const gIdx = groupMsgs.findIndex((m) => m.message_id === messageId);

  const start = Math.max(0, gIdx - contextSize);
  const end = Math.min(groupMsgs.length, gIdx + contextSize + 1);
  return groupMsgs.slice(start, end);
}

export async function getSenderActivity(
  senderName: string,
  opts: { hours?: number; limit?: number } = {}
): Promise<{ messages: Message[]; groups: string[]; message_count: number }> {
  const all = await loadMessages();
  const cutoff = opts.hours ? Date.now() - opts.hours * 3600_000 : 0;

  const messages = all
    .filter((m) => {
      if (!m.sender_name.includes(senderName)) return false;
      if (cutoff && new Date(m.timestamp).getTime() < cutoff) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, opts.limit ?? 100);

  const groups = [...new Set(messages.map((m) => m.group_name))];

  return { messages, groups, message_count: messages.length };
}
