"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { roomUrl } from "@/lib/room-helpers";

/** QR code for the room link, so people in the room can scan the TV to join. */
export function RoomQr({ code, size = 160 }: { code: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(roomUrl(code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!svg) return <div style={{ width: size, height: size }} className="rounded-xl bg-slate-100" aria-hidden />;
  return (
    <div
      role="img"
      aria-label={`QR code to join room ${code}`}
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white p-1 [&_svg]:size-full"
      // The SVG is generated locally by the qrcode library from our own URL, not user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
