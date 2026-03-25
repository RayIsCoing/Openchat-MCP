/**
 * Data layer: fetches from Google Apps Script Web App proxy.
 * No API key needed — the Apps Script handles sheet access.
 */

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

if (!APPS_SCRIPT_URL) {
  console.error("ERROR: APPS_SCRIPT_URL environment variable is required");
}

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
  data: T;
  loaded_at: number;
}

let groupsCache: Cache<Group[]> | null = null;

function isStale<T>(cache: Cache<T> | null): boolean {
  return !cache || Date.now() - cache.loaded_at > CACHE_TTL_MS;
}

async function fetchAPI(params: Record<string, string>): Promise<any> {
  const url = new URL(APPS_SCRIPT_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Groups ──

export async function loadGroups(forceRefresh = false): Promise<Group[]> {
  if (!forceRefresh && !isStale(groupsCache)) return groupsCache!.data;

  const data = await fetchAPI({ action: "groups" });
  const groups: Group[] = data.groups ?? [];
  groupsCache = { data: groups, loaded_at: Date.now() };
  return groups;
}

// ── Messages (always fetched fresh with server-side filtering) ──

export async function searchMessages(
  keyword: string,
  opts: { group_name?: string; limit?: number; hours?: number } = {}
): Promise<Message[]> {
  const params: Record<string, string> = {
    action: "messages",
    keyword,
  };
  if (opts.group_name) params.group_name = opts.group_name;
  if (opts.hours) params.hours = String(opts.hours);
  if (opts.limit) params.limit = String(opts.limit);

  const data = await fetchAPI(params);
  return data.messages ?? [];
}

export async function getRecentMessages(
  hours: number = 24,
  groupName?: string
): Promise<Message[]> {
  const params: Record<string, string> = {
    action: "messages",
    hours: String(hours),
    limit: "1000",
  };
  if (groupName) params.group_name = groupName;

  const data = await fetchAPI(params);
  return data.messages ?? [];
}

export async function getGroupMessages(
  groupName: string,
  limit: number = 200
): Promise<Message[]> {
  const data = await fetchAPI({
    action: "messages",
    group_name: groupName,
    limit: String(limit),
  });
  return data.messages ?? [];
}

// ── Stats (server-side aggregation) ──

export interface GroupStats {
  group_name: string;
  message_count: number;
  active_users: number;
  top_senders: { name: string; count: number }[];
}

export async function getStats(hours: number = 24): Promise<GroupStats[]> {
  const data = await fetchAPI({
    action: "stats",
    hours: String(hours),
  });
  return data.stats ?? [];
}

// ── Client-side analysis (built on top of messages) ──

export async function getHotTopics(
  hours: number = 24,
  groupName?: string
): Promise<{ keyword: string; count: number; sample_messages: string[] }[]> {
  const messages = await getRecentMessages(hours, groupName);
  const textMsgs = messages.filter((m) => m.msg_type === "text" && m.content.length > 1);

  const phraseCount = new Map<string, { count: number; samples: string[] }>();

  for (const m of textMsgs) {
    const content = m.content;
    if (content.length < 4) continue;

    const seen = new Set<string>();
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
  // Fetch a large batch and find context client-side
  const data = await fetchAPI({ action: "messages", limit: "5000" });
  const all: Message[] = data.messages ?? [];

  const idx = all.findIndex((m) => m.message_id === messageId);
  if (idx === -1) return [];

  const groupName = all[idx].group_name;
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
  const params: Record<string, string> = {
    action: "messages",
    sender: senderName,
  };
  if (opts.hours) params.hours = String(opts.hours);
  if (opts.limit) params.limit = String(opts.limit ?? 100);

  const data = await fetchAPI(params);
  const messages: Message[] = data.messages ?? [];
  const groups = [...new Set(messages.map((m) => m.group_name))];

  return { messages, groups, message_count: messages.length };
}
