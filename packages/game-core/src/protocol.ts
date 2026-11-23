import { z } from "zod";
import { MAX_ANSWER_LENGTH, MAX_BOTS, MAX_NAME_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.js";
import type { GameErrorCode } from "./games/wetin-you-talk/reducer.js";
import type { RoomView } from "./games/wetin-you-talk/projection.js";
import type { RewardSummary } from "./progression/profile-types.js";
import { HOME_REGION_CODES } from "./types.js";

/** Wire protocol shared by the room server and every client (web, Telegram, Discord). */

export const PROTOCOL_VERSION = 1;

const roomCodePattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(roomCodePattern, "Room codes are 4 letters");

export function isValidRoomCode(value: string): boolean {
  return roomCodeSchema.safeParse(value).success;
}

const homeRegionSchema = z.enum(HOME_REGION_CODES);
// Raw lengths are capped generously here; the reducer does the real cleaning.
const nameSchema = z.string().min(1).max(MAX_NAME_LENGTH * 4);
const tokenSchema = z.string().min(16).max(128);
/** Optional: links a room seat to a saved profile for XP, coins and cosmetics. */
const profileTokenSchema = z.string().min(16).max(128).optional();
/**
 * Optional client-generated id for a create/join attempt. If the socket drops before
 * the "welcome" arrives and the client retries with the same id, the server returns
 * the same seat instead of creating a duplicate player.
 */
const requestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("create"),
    mode: z.enum(["screen", "remote"]),
    regions: z.array(homeRegionSchema).min(1).max(HOME_REGION_CODES.length),
    familyMode: z.boolean(),
    /** Required in remote mode: the creator is also a player. */
    player: z.object({ name: nameSchema, homeRegion: homeRegionSchema }).optional(),
    profileToken: profileTokenSchema,
    requestId: requestIdSchema,
    /** Seats to fill with bots straight away ("Practice with bots"). Part of the same idempotent request. */
    bots: z.number().int().min(0).max(MAX_BOTS).optional(),
  }),
  z.object({
    t: z.literal("join"),
    code: roomCodeSchema,
    name: nameSchema,
    homeRegion: homeRegionSchema,
    profileToken: profileTokenSchema,
    requestId: requestIdSchema,
  }),
  z.object({ t: z.literal("resume"), code: roomCodeSchema, token: tokenSchema }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("answer"), promptId: z.string().min(1).max(64), text: z.string().max(MAX_ANSWER_LENGTH * 4) }),
  z.object({ t: z.literal("vote"), matchupIndex: z.number().int().min(0), option: z.number().int().min(0) }),
  z.object({ t: z.literal("advance") }),
  z.object({ t: z.literal("kick"), playerId: z.string().min(1).max(64) }),
  /** VIP/host adds a computer player to an empty seat (lobby only). Remove it with "kick". */
  z.object({ t: z.literal("add_bot") }),
  z.object({ t: z.literal("play_again") }),
  z.object({
    t: z.literal("settings"),
    regions: z.array(homeRegionSchema).min(1).max(HOME_REGION_CODES.length).optional(),
    familyMode: z.boolean().optional(),
    packs: z.array(z.string().min(1).max(64)).max(20).optional(),
  }),
  z.object({ t: z.literal("react"), emoji: z.string().min(1).max(16) }),
  /** Leave the room for good (players lose this game's points; the TV just disconnects). */
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerErrorCode =
  | GameErrorCode
  | "bad_message"
  | "room_not_found"
  | "session_expired"
  | "not_in_room"
  | "rate_limited"
  | "server_full";

export type ServerMessage =
  | {
      t: "welcome";
      protocol: number;
      code: string;
      role: "host" | "player";
      playerId: string | null;
      /** Opaque secret used to resume after a reconnect. */
      token: string;
    }
  | { t: "state"; view: RoomView; serverNow: number }
  | { t: "error"; code: ServerErrorCode; message: string }
  | { t: "kicked" }
  /** Confirms a voluntary leave; the client should forget its seat. */
  | { t: "left" }
  | { t: "pong"; serverNow: number }
  /** Sent to each profile-linked player when a game finishes. */
  | { t: "rewards"; rewards: RewardSummary }
  /** Ephemeral emoji reaction, broadcast to the whole room. */
  | { t: "reaction"; id: string; playerId: string; emoji: string };

export const ERROR_MESSAGES: Record<ServerErrorCode, string> = {
  not_allowed: "Only the host or VIP can do that.",
  wrong_phase: "That move isn't available right now.",
  not_enough_players: "You need at least 3 players to start.",
  room_full: "This room is full.",
  name_taken: "Someone in this room already has that name.",
  invalid_name: "Please enter a name.",
  game_in_progress: "This game has already started. Wait for the next one.",
  not_enough_prompts: "Not enough prompts for these settings. Add another country or turn off family mode.",
  unknown_player: "That player isn't in this room.",
  invalid_answer: "Type an answer first.",
  already_answered: "You've already answered that one.",
  invalid_vote: "You can't vote for that answer.",
  too_many_bots: `That's the most bots a room can have (${MAX_BOTS}). Invite a friend for more!`,
  needs_human: "At least one person has to play. Bots can't party on their own!",
  bad_message: "Something went wrong. Please refresh.",
  room_not_found: "We couldn't find that room. Check the code.",
  session_expired: "Your session expired. Join again.",
  not_in_room: "Join a room first.",
  rate_limited: "Slow down a little!",
  server_full: "The server is busy. Try again in a minute.",
};
