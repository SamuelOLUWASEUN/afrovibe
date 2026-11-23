import { MAX_ANSWER_LENGTH, MAX_NAME_LENGTH } from "./constants.js";

/**
 * Deliberately small starter list. Family mode masks these; it is a speed bump,
 * not real moderation — the host kick button is the actual safety valve.
 * Extend from player reports once the beta is live.
 */
const FAMILY_MODE_BLOCKLIST: readonly string[] = [
  "fuck",
  "shit",
  "bitch",
  "pussy",
  "dick",
  "cunt",
  "asshole",
  "nigga",
  "nigger",
  "whore",
  "slut",
  "ashawo",
  "olosho",
  "toto",
  "prick",
];

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g;
const WHITESPACE_RUN = /\s+/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BLOCKLIST_PATTERN = new RegExp(
  `\\b(${FAMILY_MODE_BLOCKLIST.map(escapeRegExp).join("|")})\\w*`,
  "gi",
);

/** Strips control/bidi characters, collapses whitespace, trims, and clamps length. */
export function normaliseText(raw: string, maxLength: number): string {
  return Array.from(raw.replace(CONTROL_CHARS, "").replace(WHITESPACE_RUN, " ").trim())
    .slice(0, maxLength)
    .join("");
}

export function maskBlockedWords(text: string): string {
  return text.replace(BLOCKLIST_PATTERN, (match) => `${match[0] ?? ""}${"*".repeat(Math.max(match.length - 1, 0))}`);
}

export function cleanAnswer(raw: string, familyMode: boolean): string {
  const text = normaliseText(raw, MAX_ANSWER_LENGTH);
  return familyMode ? maskBlockedWords(text) : text;
}

export function cleanName(raw: string): string {
  return maskBlockedWords(normaliseText(raw, MAX_NAME_LENGTH));
}
