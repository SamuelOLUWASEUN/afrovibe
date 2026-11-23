import {
  BOT_ANSWER_DELAY_MS,
  BOT_DEADLINE_MARGIN_MS,
  BOT_VOTE_DELAY_MS,
  botDelayMs,
  botTask,
  pickBotAnswer,
  pickBotVote,
  type Prompt,
  type RoomEvent,
  type RoomState,
  type Rng,
  type ServerErrorCode,
} from "@afro-party/game-core";

export interface BotDriverOptions {
  /** Current authoritative state of the room. */
  getState: () => RoomState;
  /** Applies an event through the room's normal path (reducer, broadcast, timers). */
  act: (event: RoomEvent) => ServerErrorCode | null;
  rng: Rng;
  prompts: ReadonlyMap<string, Prompt>;
  now?: () => number;
  log?: (message: string) => void;
  /** Scales bots' thinking time (100 = normal). Tests use a small value. */
  delayPercent?: number;
}

interface Pending {
  /** phaseSeq the timer was scheduled for; a phase change makes it stale. */
  seq: number;
  /** null = this bot gave up for this phase after an error (don't retry in a loop). */
  timer: NodeJS.Timeout | null;
}

/**
 * Decides WHEN each bot in one room acts; the pure bot brain in game-core decides WHAT.
 *
 * - At most one timer per bot, tied to the phaseSeq it was scheduled in, so a stale
 *   timer can never act in a later phase (same trick as the room's phase timer).
 * - Bots only act while at least one person is connected. If everyone's phone drops,
 *   the bots pause and the normal phase deadlines carry on; they resume on reconnect.
 * - Bots go through the same reducer events as people, so every rule and anti-cheat
 *   check applies to them too.
 */
export class BotDriver {
  private readonly pending = new Map<string, Pending>();
  private readonly usedAnswers = new Set<string>();
  private answersForGame = -1;
  private disposed = false;

  constructor(private readonly options: BotDriverOptions) {}

  /** Call after every state change. Cheap and idempotent. */
  sync(): void {
    if (this.disposed) return;
    const state = this.options.getState();
    if (state.gameNumber !== this.answersForGame) {
      this.usedAnswers.clear();
      this.answersForGame = state.gameNumber;
    }
    const someoneHere = state.players.some((p) => !p.isBot && p.connected);
    const botIds = new Set(state.players.filter((p) => p.isBot).map((p) => p.id));

    for (const [botId, pending] of this.pending) {
      if (!someoneHere || pending.seq !== state.phaseSeq || !botIds.has(botId)) this.cancel(botId);
    }
    const phase = state.phase;
    if (!someoneHere || !("deadline" in phase)) return;

    const now = this.now();
    const latest = phase.deadline - now - BOT_DEADLINE_MARGIN_MS;
    for (const botId of botIds) {
      if (this.pending.has(botId)) continue;
      const task = botTask(state, botId);
      if (!task || latest <= 0) continue;
      const range = task.kind === "answer" ? BOT_ANSWER_DELAY_MS : BOT_VOTE_DELAY_MS;
      const scaled = (botDelayMs(range, this.options.rng) * (this.options.delayPercent ?? 100)) / 100;
      const delay = Math.min(Math.round(scaled), latest);
      const seq = state.phaseSeq;
      const timer = setTimeout(() => this.fire(botId, seq), delay);
      timer.unref();
      this.pending.set(botId, { seq, timer });
    }
  }

  /** Number of bots with a move scheduled (for tests and diagnostics). */
  get scheduled(): number {
    return [...this.pending.values()].filter((p) => p.timer !== null).length;
  }

  dispose(): void {
    this.disposed = true;
    for (const botId of [...this.pending.keys()]) this.cancel(botId);
  }

  private fire(botId: string, seq: number): void {
    const pending = this.pending.get(botId);
    if (this.disposed || !pending || pending.seq !== seq) return;
    // Remove first: act() re-enters sync(), which should be free to schedule this bot's next move.
    this.pending.delete(botId);
    const state = this.options.getState();
    if (state.phaseSeq !== seq) return;
    const task = botTask(state, botId);
    if (!task) return;

    let event: RoomEvent | null = null;
    if (task.kind === "answer") {
      const prompt = this.options.prompts.get(task.promptId);
      const text = pickBotAnswer({
        promptRegions: prompt?.regions ?? ["pan"],
        roomRegions: state.settings.regions,
        used: this.usedAnswers,
        rng: this.options.rng,
      });
      this.usedAnswers.add(text);
      event = { type: "submit_answer", playerId: botId, promptId: task.promptId, text };
    } else {
      const matchup = state.matchups[task.matchupIndex];
      const option = matchup ? pickBotVote(matchup, botId, this.options.rng) : null;
      if (option !== null) event = { type: "cast_vote", playerId: botId, matchupIndex: task.matchupIndex, option };
    }

    const error = event ? this.options.act(event) : "invalid_vote";
    if (error) {
      // Park the bot for the rest of this phase instead of retrying in a tight loop.
      this.options.log?.(`[bots] ${botId} could not ${task.kind}: ${error}`);
      if (this.options.getState().phaseSeq === seq) this.pending.set(botId, { seq, timer: null });
    }
  }

  private cancel(botId: string): void {
    const pending = this.pending.get(botId);
    if (pending?.timer) clearTimeout(pending.timer);
    this.pending.delete(botId);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
