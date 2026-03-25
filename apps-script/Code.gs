/**
 * Deploy: Extensions → Apps Script → Deploy → New Deployment → Web App
 * Execute as: Me
 * Who has access: Anyone
 *
 * Paste this entire file into the Apps Script editor.
 */

const SPREADSHEET_ID = "1qjdEV_CvthLoOHXnWgEaqV2Byd6qVRh2MHJtdICArtM";
const MESSAGES_SHEET = "消息";
const GROUPS_SHEET = "群组";

function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();

  try {
    let result;
    switch (action) {
      case "groups":
        result = getGroups();
        break;
      case "messages":
        result = getMessages(e.parameter);
        break;
      case "stats":
        result = getStats(e.parameter);
        break;
      default:
        result = { error: "Unknown action. Use: groups, messages, stats" };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getGroups() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GROUPS_SHEET);
  if (!sheet) return { error: "Sheet not found: " + GROUPS_SHEET };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    rows.push({
      group_id: String(data[i][0] || ""),
      group_name: String(data[i][1] || ""),
      member_count: Number(data[i][2]) || 0
    });
  }
  return { groups: rows, total: rows.length };
}

function getMessages(params) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MESSAGES_SHEET);
  if (!sheet) return { error: "Sheet not found: " + MESSAGES_SHEET };

  var data = sheet.getDataRange().getValues();
  var keyword = (params.keyword || "").toLowerCase();
  var groupName = params.group_name || "";
  var hours = parseInt(params.hours) || 0;
  var limit = Math.min(parseInt(params.limit) || 200, 1000);
  var sender = (params.sender || "").toLowerCase();

  var cutoff = hours > 0 ? new Date(Date.now() - hours * 3600000) : null;
  var results = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var content = String(row[5] || "");
    var gName = String(row[6] || "");
    var ts = row[4];
    var sName = String(row[3] || "");

    // Time filter
    if (cutoff) {
      var msgDate = ts instanceof Date ? ts : new Date(ts);
      if (msgDate < cutoff) continue;
    }
    
    // Keyword filter
    if (keyword && content.toLowerCase().indexOf(keyword) === -1) continue;
    
    // Group filter
    if (groupName && gName.indexOf(groupName) === -1) continue;
    
    // Sender filter
    if (sender && sName.toLowerCase().indexOf(sender) === -1) continue;
    
    results.push({
      message_id: String(row[0] || ""),
      group_id: String(row[1] || ""),
      sender_id: String(row[2] || ""),
      sender_name: sName,
      timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
      content: content,
      group_name: gName,
      msg_type: String(row[7] || "text")
    });
    
    if (results.length >= limit) break;
  }

  return { messages: results, total: results.length };
}

function getStats(params) {
  var hours = parseInt(params.hours) || 24;
  var cutoff = new Date(Date.now() - hours * 3600000);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MESSAGES_SHEET);
  var data = sheet.getDataRange().getValues();

  var groupStats = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = row[4];
    var msgDate = ts instanceof Date ? ts : new Date(ts);
    if (msgDate < cutoff) continue;

    var gName = String(row[6] || "未知群聊");
    var sName = String(row[3] || "未知");
    
    if (!groupStats[gName]) {
      groupStats[gName] = { message_count: 0, senders: {} };
    }
    groupStats[gName].message_count++;
    groupStats[gName].senders[sName] = (groupStats[gName].senders[sName] || 0) + 1;
  }

  var result = [];
  for (var g in groupStats) {
    var s = groupStats[g];
    var topSenders = Object.keys(s.senders)
      .map(function(name) { return { name: name, count: s.senders[name] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10);

    result.push({
      group_name: g,
      message_count: s.message_count,
      active_users: Object.keys(s.senders).length,
      top_senders: topSenders
    });
  }

  result.sort(function(a, b) { return b.message_count - a.message_count; });
  return { stats: result, hours: hours };
}
