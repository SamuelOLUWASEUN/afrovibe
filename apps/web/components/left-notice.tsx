"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** One-off note on the home page after leaving a room, then the URL is cleaned up. */
export function LeftNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (params.get("left") !== "1") return;
    setShow(true);
    router.replace("/", { scroll: false });
    const id = window.setTimeout(() => setShow(false), 5_000);
    return () => window.clearTimeout(id);
  }, [params, router]);

  if (!show) return null;
  return (
    <p role="status" className="mx-auto w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white motion-safe:animate-pop">
      You left the room. Start or join another game whenever you&apos;re ready 👋🏾
    </p>
  );
}
