import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SCHEMA_VERSION = 4;
export const STATUSES = new Set(["before", "considering", "executed"]);
export const ENRICHMENTS = new Set(["none", "partial", "complete", "failed"]);
export const CONVERSATION_VIEWS = new Set([...STATUSES, "all"]);
const ORIGINS = new Set(["user", "ai_inferred", "ai_research"]);
const CONFIRMATIONS = new Set(["confirmed", "unconfirmed"]);
const ASSISTANCE_ACTIONS = new Set(["research", "decline"]);
const FOCUS_KINDS = new Set([
  "reason_for", "reason_against", "background", "priority", "constraint",
  "desired_outcome", "completion_condition", "assistance", "summary",
]);
const DIALOGUE_TOPICS = new Set([
  "background", "motivation", "priority", "constraint", "desired_outcome",
  "completion_condition", "blocker", "assistance",
]);
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid"]);
const SECRET_PARAMS = new Set([
  "access_token", "api_key", "apikey", "auth", "authorization", "signature", "sig", "token",
  "x-amz-credential", "x-amz-security-token", "x-amz-signature", "x-goog-credential", "x-goog-signature"
]);
const ID_PATTERN = /^wnn_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowIso() {
  return new Date().toISOString();
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function jsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return structuredClone(value);
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function enumArray(value, allowed) {
  return [...new Set(stringArray(value).filter((item) => allowed.has(item)))];
}

function normalizeActiveFocus(value) {
  const focus = jsonObject(value);
  if (!focus) return null;
  const kind = enumValue(focus.kind, FOCUS_KINDS, null);
  const reasonId = stringOrNull(focus.reason_id);
  const summary = stringOrNull(focus.summary);
  if (!kind && !reasonId && !summary) return null;
  return { kind, reason_id: reasonId, summary };
}

export function resolveDataRoot({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.WHYNOTNOW_HOME) return path.resolve(env.WHYNOTNOW_HOME);
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "WhyNotNow");
  }
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "WhyNotNow");
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "whynotnow");
}

export function conversationsDirectory(options = {}) {
  return path.join(resolveDataRoot(options), "conversations-v4");
}

export function isConversationId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}

function assertConversationId(id) {
  if (!isConversationId(id)) throw new Error(`Invalid conversation id: ${id}`);
}

function assertCurrentSchema(record) {
  if (record?.schema_version !== SCHEMA_VERSION) {
    const error = new Error(`Unsupported conversation schema: ${record?.schema_version ?? "missing"}`);
    error.code = "UNSUPPORTED_SCHEMA";
    throw error;
  }
  return record;
}

function conversationPath(id, options = {}) {
  assertConversationId(id);
  return path.join(conversationsDirectory(options), `${id}.json`);
}

function normalizeReasonFor(value, timestamp) {
  const reason = jsonObject(value) ?? {};
  return {
    id: typeof reason.id === "string" && reason.id ? reason.id : `for_${randomUUID()}`,
    text: stringOrNull(reason.text) ?? "",
    origin: enumValue(reason.origin, ORIGINS, "ai_inferred"),
    confirmation: enumValue(reason.confirmation, CONFIRMATIONS, "unconfirmed"),
    basis: stringOrNull(reason.basis),
    added_at: stringOrNull(reason.added_at) ?? timestamp,
  };
}

function normalizeReasonAgainst(value, timestamp) {
  const reason = jsonObject(value) ?? {};
  const solvable = reason.solvable === true || reason.solvable === false ? reason.solvable : null;
  return {
    id: typeof reason.id === "string" && reason.id ? reason.id : `against_${randomUUID()}`,
    text: stringOrNull(reason.text) ?? "",
    origin: enumValue(reason.origin, ORIGINS, "ai_inferred"),
    confirmation: enumValue(reason.confirmation, CONFIRMATIONS, "unconfirmed"),
    solvable,
    solutions: stringArray(reason.solutions),
    children: Array.isArray(reason.children)
      ? reason.children.map((child) => normalizeReasonAgainst(child, timestamp))
      : [],
    added_at: stringOrNull(reason.added_at) ?? timestamp,
  };
}

export function normalizeUrlEntry(value, timestamp = nowIso()) {
  const entry = typeof value === "string" ? { url: value } : (jsonObject(value) ?? {});
  if (typeof entry.url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(entry.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_")
      || TRACKING_PARAMS.has(key.toLowerCase())
      || SECRET_PARAMS.has(key.toLowerCase())
    ) {
      parsed.searchParams.delete(key);
    }
  }
  return {
    url: parsed.toString(),
    label: stringOrNull(entry.label),
    origin: enumValue(entry.origin, ORIGINS, "user"),
    added_at: stringOrNull(entry.added_at) ?? timestamp,
  };
}

function normalizeUrls(value, timestamp) {
  const byUrl = new Map();
  for (const candidate of Array.isArray(value) ? value : []) {
    const normalized = normalizeUrlEntry(candidate, timestamp);
    if (normalized) byUrl.set(normalized.url, normalized);
  }
  return [...byUrl.values()];
}

function normalizeNote(value, timestamp) {
  const note = typeof value === "string" ? { text: value } : (jsonObject(value) ?? {});
  return {
    id: typeof note.id === "string" && note.id ? note.id : `note_${randomUUID()}`,
    text: stringOrNull(note.text) ?? "",
    origin: enumValue(note.origin, ORIGINS, "user"),
    created_at: stringOrNull(note.created_at) ?? timestamp,
  };
}

function normalizeAssistance(value, timestamp) {
  const choice = jsonObject(value) ?? {};
  return {
    id: typeof choice.id === "string" && choice.id ? choice.id : `assist_${randomUUID()}`,
    reason_id: stringOrNull(choice.reason_id),
    problem_summary: stringOrNull(choice.problem_summary) ?? "",
    proposed_scope: stringOrNull(choice.proposed_scope) ?? "",
    expected_result: stringOrNull(choice.expected_result) ?? "",
    action: enumValue(choice.action, ASSISTANCE_ACTIONS, "decline"),
    created_at: stringOrNull(choice.created_at) ?? timestamp,
  };
}

function normalizeProject(value) {
  const project = jsonObject(value) ?? {};
  let gitRemote = stringOrNull(project.git_remote);
  if (gitRemote) {
    try {
      const parsed = new URL(gitRemote);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parsed.username = "";
        parsed.password = "";
        parsed.search = "";
        parsed.hash = "";
        gitRemote = parsed.toString();
      }
    } catch {
      // Preserve non-URL Git remote forms such as git@github.com:owner/repo.git.
    }
  }
  return {
    name: stringOrNull(project.name),
    root_path: stringOrNull(project.root_path),
    git_remote: gitRemote,
  };
}

function defaultTitle(taskText) {
  const compact = taskText.trim().replace(/\s+/g, " ");
  return compact ? compact.slice(0, 80) : "Untitled conversation";
}

function normalizeRecord(input, { id, revision, createdAt, timestamp } = {}) {
  const data = jsonObject(input) ?? {};
  const taskText = stringOrNull(data.task_text) ?? "";
  const interpretation = jsonObject(data.interpretation) ?? {};
  const whyNotNow = jsonObject(data.why_not_now) ?? {};
  const dialogue = jsonObject(data.dialogue) ?? {};
  return {
    schema_version: SCHEMA_VERSION,
    conversation_id: id ?? data.conversation_id,
    revision: revision ?? 1,
    title: stringOrNull(data.title) ?? defaultTitle(taskText),
    task_text: taskText,
    status: enumValue(data.status, STATUSES, "considering"),
    enrichment: enumValue(data.enrichment, ENRICHMENTS, "none"),
    interpretation: {
      goal: stringOrNull(interpretation.goal),
      current_situation: stringOrNull(interpretation.current_situation),
      desired_outcome: stringOrNull(interpretation.desired_outcome),
      completion_conditions: stringArray(interpretation.completion_conditions),
    },
    reasons_for: Array.isArray(data.reasons_for)
      ? data.reasons_for.map((reason) => normalizeReasonFor(reason, timestamp))
      : [],
    why_not_now: {
      reasons: Array.isArray(whyNotNow.reasons)
        ? whyNotNow.reasons.map((reason) => normalizeReasonAgainst(reason, timestamp))
        : [],
      unresolved_questions: stringArray(whyNotNow.unresolved_questions),
    },
    related_urls: normalizeUrls(data.related_urls, timestamp),
    notes: Array.isArray(data.notes) ? data.notes.map((note) => normalizeNote(note, timestamp)) : [],
    assistance_choices: Array.isArray(data.assistance_choices)
      ? data.assistance_choices.map((choice) => normalizeAssistance(choice, timestamp))
      : [],
    project_refs: Array.isArray(data.project_refs) ? data.project_refs.map(normalizeProject) : [],
    dialogue: {
      asked_reason_for: dialogue.asked_reason_for === true,
      active_focus: normalizeActiveFocus(dialogue.active_focus),
      covered_topics: enumArray(dialogue.covered_topics, DIALOGUE_TOPICS),
      open_threads: stringArray(dialogue.open_threads),
    },
    created_at: createdAt ?? stringOrNull(data.created_at) ?? timestamp,
    updated_at: timestamp,
  };
}

function mergePatch(target, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return structuredClone(patch);
  const result = target && typeof target === "object" && !Array.isArray(target)
    ? structuredClone(target)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) result[key] = null;
    else if (typeof value === "object" && !Array.isArray(value)) result[key] = mergePatch(result[key], value);
    else result[key] = structuredClone(value);
  }
  return result;
}

async function ensureDirectory(options) {
  await fs.mkdir(conversationsDirectory(options), { recursive: true });
}

async function writeAtomic(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function createConversation(input = {}, { id: suppliedId, ...options } = {}) {
  const timestamp = nowIso();
  const id = suppliedId ?? `wnn_${randomUUID()}`;
  assertConversationId(id);
  const record = normalizeRecord(input, { id, revision: 1, createdAt: timestamp, timestamp });
  await ensureDirectory(options);
  await writeAtomic(conversationPath(id, options), record);
  return record;
}

export async function getConversation(id, options = {}) {
  const raw = await fs.readFile(conversationPath(id, options), "utf8");
  return assertCurrentSchema(JSON.parse(raw));
}

export async function updateConversation(id, input = {}, { expectedRevision, ...options } = {}) {
  const current = await getConversation(id, options);
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    const error = new Error(`Revision conflict: expected ${expectedRevision}, found ${current.revision}`);
    error.code = "REVISION_CONFLICT";
    throw error;
  }
  const command = jsonObject(input) ?? {};
  const protectedKeys = new Set([
    "schema_version", "conversation_id", "revision", "created_at", "updated_at", "notes", "assistance_choices",
  ]);
  const patch = jsonObject(command.patch) ?? {};
  for (const key of protectedKeys) delete patch[key];
  const timestamp = nowIso();
  const merged = mergePatch(current, patch);
  merged.notes = [
    ...(Array.isArray(current.notes) ? current.notes : []),
    ...(Array.isArray(command.append_notes) ? command.append_notes.map((note) => normalizeNote(note, timestamp)) : []),
  ];
  merged.assistance_choices = [
    ...(Array.isArray(current.assistance_choices) ? current.assistance_choices : []),
    ...(Array.isArray(command.append_assistance)
      ? command.append_assistance.map((choice) => normalizeAssistance(choice, timestamp))
      : []),
  ];
  const record = normalizeRecord(merged, {
    id: current.conversation_id,
    revision: current.revision + 1,
    createdAt: current.created_at,
    timestamp,
  });
  await writeAtomic(conversationPath(id, options), record);
  return record;
}

function matchesView(record, view) {
  return view === "all" || record.status === view;
}

function reviewReason(record) {
  const focus = record.dialogue?.active_focus?.summary;
  if (typeof focus === "string" && focus.trim()) return focus;
  const firstReason = record.why_not_now?.reasons?.[0]?.text;
  return typeof firstReason === "string" && firstReason.trim() ? firstReason : null;
}

export function conversationSummary(record) {
  return {
    conversation_id: record.conversation_id,
    revision: record.revision,
    title: record.title,
    task_text: record.task_text,
    review_reason: reviewReason(record),
    status: record.status,
    enrichment: record.enrichment,
    reasons_for_count: Array.isArray(record.reasons_for) ? record.reasons_for.length : 0,
    reasons_against_count: Array.isArray(record.why_not_now?.reasons) ? record.why_not_now.reasons.length : 0,
    urls_count: Array.isArray(record.related_urls) ? record.related_urls.length : 0,
    updated_at: record.updated_at,
  };
}

export async function listConversations({ view = "considering", query = "", ...options } = {}) {
  if (!CONVERSATION_VIEWS.has(view)) throw new Error(`Invalid conversation view: ${view}`);
  await ensureDirectory(options);
  const names = await fs.readdir(conversationsDirectory(options));
  const records = [];
  const errors = [];
  const needle = query.trim().toLocaleLowerCase();
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try {
      const record = assertCurrentSchema(JSON.parse(await fs.readFile(path.join(conversationsDirectory(options), name), "utf8")));
      if (!matchesView(record, view)) continue;
      const haystack = `${record.title ?? ""}\n${record.task_text ?? ""}`.toLocaleLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      records.push(record);
    } catch (error) {
      errors.push({
        file: name,
        code: error?.code === "UNSUPPORTED_SCHEMA" ? "UNSUPPORTED_SCHEMA" : "CORRUPT_RECORD",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  records.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
  return {
    conversations: records.map(conversationSummary),
    errors,
  };
}

export async function deleteConversation(id, options = {}) {
  await fs.rm(conversationPath(id, options));
  return { deleted: true, conversation_id: id };
}
