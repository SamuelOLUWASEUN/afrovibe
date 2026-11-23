"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRoomConnection } from "@/lib/use-room-connection";
import { Button, Card, Spinner } from "../ui";
import { HostScreen } from "./host-screen";
import { JoinGate } from "./join-gate";
import { PlayerController } from "./player-controller";
import { RoomHeader } from "./room-header";

export function RoomClient({ code }: { code: string }) {
  const connection = useRoomConnection(code);
  const { status, view, error } = connection;
  const router = useRouter();

  // After a confirmed leave, go home; replace() so Back doesn't land in the old room.
  useEffect(() => {
    if (status === "left") router.replace("/?left=1");
  }, [status, router]);

  let body;
  if (status === "left") {
    body = <Spinner label="Leaving…" />;
  } else if (status === "not_found") {
    body = (
      <EndScreen
        title="Room not found"
        message="That room code doesn't exist or the game has ended. Ask the host for a fresh code."
      />
    );
  } else if (status === "kicked") {
    body = <EndScreen title="You were removed" message="The host removed you from this room." />;
  } else if (status === "unreachable") {
    body = (
      <EndScreen
        title="Can't reach the game"
        message={
          typeof navigator !== "undefined" && !navigator.onLine
            ? "You're offline. Check your data or Wi-Fi, then try again."
            : "The game server isn't answering. It may be restarting. Try again in a moment."
        }
        action={<Button onClick={connection.retry}>Try again</Button>}
      />
    );
  } else if (status === "needs_join") {
    body = <JoinGate code={code} onJoin={connection.join} />;
  } else if (!view) {
    body = <Spinner label={status === "reconnecting" ? "Reconnecting…" : "Connecting to the room…"} />;
  } else if (view.me.role === "host") {
    body = <HostScreen view={view} connection={connection} />;
  } else {
    body = <PlayerController view={view} connection={connection} />;
  }

  return (
    <>
      {view && status !== "left" && <RoomHeader view={view} connection={connection} />}
      {status === "reconnecting" && view && (
        <div role="status" className="sticky top-[49px] z-20 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Connection lost. Reconnecting… your seat is saved.
        </div>
      )}
      {body}
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        {error && (
          <div className="pointer-events-auto rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg motion-safe:animate-pop">
            {error.message}
          </div>
        )}
      </div>
    </>
  );
}

function EndScreen({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
      <Card className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-600">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {action}
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            Back to start
          </Link>
        </div>
      </Card>
    </main>
  );
}
