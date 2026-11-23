import { isValidRoomCode } from "@afro-party/game-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomClient } from "@/components/room/room-client";

export const metadata: Metadata = {
  title: "Wetin You Talk? · Game room",
  robots: { index: false },
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw === "new" ? raw : raw.toUpperCase();
  if (code !== "new" && !isValidRoomCode(code)) notFound();
  return <RoomClient code={code} />;
}
