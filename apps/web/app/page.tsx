import { Suspense } from "react";
import { HostForm, JoinForm } from "@/components/landing-forms";
import { LeftNotice } from "@/components/left-notice";
import { Flag } from "@/components/flag";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:py-16">
        {/* useSearchParams needs Suspense to keep this page statically generated. */}
        <Suspense fallback={null}>
          <LeftNotice />
        </Suspense>
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 uppercase">
            <span className="inline-flex gap-1">
              {(["ng", "gh", "ke", "za"] as const).map((c) => (
                <Flag key={c} code={c} />
              ))}
            </span>{" "}
            · 3–8 players · or practise with bots
          </span>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-6xl">Wetin You Talk?</h1>
          <p className="max-w-xl text-lg text-slate-600">
            Write the funniest answer, vote for your favourite, settle the jollof wars. Play in the same room or across
            continents on a call. No app to download.
          </p>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          <JoinForm />
          <HostForm />
        </div>
        <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 id="how" className="sr-only">
            How to play
          </h2>
          {[
            ["✍️", "Answer", "Everyone gets prompts on their phone. Write something funny before time runs out."],
            ["🗳️", "Vote", "Two answers go head to head. Everyone else picks the funniest, no names shown."],
            ["🏆", "Win", "Each vote is points. Take every vote (2+) for a Gbas Gbos! bonus. Last Lash is worth triple."],
            [
              "⬆️",
              "Level up",
              "Every game earns XP, coins and badges. Spend coins on avatars, card designs and new prompt packs.",
            ],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-2xl" aria-hidden>
                {icon}
              </div>
              <h3 className="mt-2 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
