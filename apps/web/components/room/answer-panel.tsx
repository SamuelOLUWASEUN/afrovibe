"use client";

import type { PhaseView, RoomView } from "@afro-party/game-core";
import { useEffect, useState, type FormEvent } from "react";
import { playerName } from "@/lib/room-helpers";
import type { RoomConnection } from "@/lib/use-room-connection";
import { Button, Card } from "../ui";

type AnsweringPhase = Extract<PhaseView, { kind: "answering" }>;

export function AnswerPanel({
  view,
  phase,
  connection,
}: {
  view: RoomView;
  phase: AnsweringPhase;
  connection: RoomConnection;
}) {
  const next = phase.myPrompts.find((p) => !p.answered);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  // Fresh textarea for each new prompt.
  const promptId = next?.promptId ?? null;
  useEffect(() => {
    setDraft("");
    setPending(false);
  }, [promptId]);

  // Re-enable the button if the server rejected the answer.
  useEffect(() => {
    if (connection.error) setPending(false);
  }, [connection.error]);

  if (!next) {
    return (
      <Card className="text-center">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <h2 className="mt-2 text-xl font-bold">Answers locked in!</h2>
        {phase.waitingIds.length > 0 && (
          <p className="mt-2 text-slate-600">
            Waiting for {phase.waitingIds.map((id) => playerName(view, id)).join(", ")}…
          </p>
        )}
      </Card>
    );
  }

  const index = phase.myPrompts.indexOf(next) + 1;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setPending(true);
    connection.send({ t: "answer", promptId: next.promptId, text });
  };

  return (
    <Card>
      <p className="text-sm font-medium text-slate-500">
        Prompt {index} of {phase.myPrompts.length}
      </p>
      <h2 className="mt-2 text-2xl leading-snug font-bold">{next.text}</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={phase.maxAnswerLength}
          rows={3}
          autoFocus
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Be funny. Be quick."
          className="w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-lg outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 tabular-nums">
            {draft.length}/{phase.maxAnswerLength}
          </span>
          <Button type="submit" disabled={!draft.trim() || pending}>
            {pending ? "Sending…" : "Send answer"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
