// End-to-end smoke test: a host screen and 4 bot phones play a full game
// against a running room server. Usage: SERVER_URL=ws://localhost:8787/ws node scripts/smoke-game.mjs
import WebSocket from "ws";

const URL = process.env.SERVER_URL ?? "ws://localhost:8787/ws";
const TIMEOUT_MS = 30_000;

function connect(label) {
  const ws = new WebSocket(URL);
  const client = { label, ws, view: null, welcome: null, errors: [], listeners: new Set() };
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.t === "welcome") client.welcome = msg;
    if (msg.t === "state") client.view = msg.view;
    if (msg.t === "error") client.errors.push(msg.code);
    for (const fn of client.listeners) fn(msg);
  });
  client.send = (msg) => ws.send(JSON.stringify(msg));
  client.ready = new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return client;
}

function waitFor(client, predicate, what) {
  return new Promise((resolve, reject) => {
    if (predicate(client)) return resolve();
    const timer = setTimeout(() => {
      client.listeners.delete(check);
      reject(new Error(`${client.label}: timed out waiting for ${what} (phase=${client.view?.phase.kind})`));
    }, TIMEOUT_MS);
    const check = () => {
      if (predicate(client)) {
        clearTimeout(timer);
        client.listeners.delete(check);
        resolve();
      }
    };
    client.listeners.add(check);
  });
}

const phaseIs = (kind) => (c) => c.view?.phase.kind === kind;

async function main() {
  const host = connect("host");
  await host.ready;
  host.send({ t: "create", mode: "screen", regions: ["ng", "gh"], familyMode: true });
  await waitFor(host, (c) => c.welcome && c.view, "room created");
  const code = host.welcome.code;
  console.log(`room ${code} created`);

  const bots = ["Tunde", "Ama", "Wanjiru", "Thabo"].map((name) => connect(name));
  await Promise.all(bots.map((b) => b.ready));
  const regions = ["ng", "gh", "ke", "za"];
  bots.forEach((b, i) => b.send({ t: "join", code, name: b.label, homeRegion: regions[i] }));
  await waitFor(host, (c) => c.view?.players.length === 4, "4 players");
  await Promise.all(bots.map((b) => waitFor(b, (c) => c.welcome && c.view, "welcome")));
  console.log("4 players joined:", host.view.players.map((p) => p.name).join(", "));

  // Reconnect check: drop Thabo's socket and resume with his token.
  const thabo = bots[3];
  const token = thabo.welcome.token;
  thabo.ws.close();
  await waitFor(host, (c) => c.view.players.find((p) => p.name === "Thabo")?.connected === false, "Thabo offline");
  const thabo2 = connect("Thabo");
  await thabo2.ready;
  thabo2.send({ t: "resume", code, token });
  await waitFor(host, (c) => c.view.players.find((p) => p.name === "Thabo")?.connected === true, "Thabo back");
  bots[3] = thabo2;
  console.log("reconnect via token: OK");

  host.send({ t: "start" });
  let reveals = 0;
  for (let round = 0; round < 3; round += 1) {
    await waitFor(host, phaseIs("answering"), `round ${round + 1} answering`);
    await Promise.all(bots.map((b) => waitFor(b, phaseIs("answering"), "answering view")));
    for (const b of bots) {
      for (const p of b.view.phase.myPrompts) {
        b.send({ t: "answer", promptId: p.promptId, text: `${b.label}'s answer to ${p.promptId}` });
      }
    }
    while (true) {
      await waitFor(host, (c) => ["voting", "reveal", "scoreboard"].includes(c.view.phase.kind), "post-answer phase");
      const kind = host.view.phase.kind;
      if (kind === "scoreboard") break;
      if (kind === "voting") {
        const idx = host.view.phase.matchupIndex;
        await Promise.all(bots.map((b) => waitFor(b, (c) => c.view.phase.kind === "voting" && c.view.phase.matchupIndex === idx, "voting view")));
        for (const b of bots) {
          if (!b.view.phase.canVote) continue;
          const option = b.view.phase.options.find((o) => o.votable);
          if (option) b.send({ t: "vote", matchupIndex: idx, option: option.index });
        }
        await waitFor(host, (c) => c.view.phase.kind === "reveal" && c.view.phase.matchupIndex === idx, "reveal");
      }
      reveals += 1;
      const seqBefore = host.view.phase.matchupIndex;
      host.send({ t: "advance" });
      await waitFor(
        host,
        (c) => c.view.phase.kind !== "reveal" || c.view.phase.matchupIndex !== seqBefore,
        "advance from reveal",
      );
    }
    console.log(`round ${round + 1} done, scores:`, host.view.players.map((p) => `${p.name}=${p.score}`).join(" "));
    host.send({ t: "advance" });
  }
  await waitFor(host, phaseIs("final"), "final");
  const winners = host.view.phase.winnerIds.map((id) => host.view.players.find((p) => p.id === id)?.name);
  console.log(`final reached after ${reveals} reveals. winner(s): ${winners.join(", ")}`);

  const unexpected = [host, ...bots].flatMap((c) => c.errors.map((e) => `${c.label}:${e}`));
  if (unexpected.length > 0) throw new Error(`unexpected errors: ${unexpected.join(", ")}`);
  if (winners.length === 0) throw new Error("no winner");

  for (const c of [host, ...bots]) c.ws.close();
  console.log("SMOKE TEST PASSED");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err.message);
  process.exit(1);
});
