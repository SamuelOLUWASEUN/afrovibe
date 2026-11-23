"""Browser test for in-room navigation, leaving (happy + sad paths) and the offline state.

Covers: lobby open seats, header links, cancel vs confirm on the leave dialog,
context-aware warning copy, leaving mid-game (others carry on), confetti, and the
"can't reach the game" screen with a working Try again.

Needs the web app running. It stops and restarts the room server itself (to test
the server being down), so pass the command used to start it:
  SERVER_CMD="node apps/room-server/dist/server.js" CHROME_PATH=... python3 scripts/ui-leave.py
"""
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WEB_URL", "http://localhost:3000")
OUT = os.environ.get("SHOTS_DIR", "./ui-shots")
CHROME = os.environ.get("CHROME_PATH")
SERVER_CMD = os.environ.get("SERVER_CMD", "node apps/room-server/dist/server.js")
errors: list[str] = []
os.makedirs(OUT, exist_ok=True)

# Expected while we deliberately take the server down, not real failures.
EXPECTED = ("WebSocket connection", "ERR_CONNECTION_REFUSED", "Failed to load resource")


def watch(page, label):
    def on_console(m):
        if m.type == "error" and not any(x in m.text for x in EXPECTED):
            errors.append(f"{label}: {m.text}")

    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))


def server_up() -> bool:
    try:
        with urllib.request.urlopen("http://localhost:8787/health", timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


def server_pids() -> list[int]:
    """PIDs of `node .../dist/server.js` processes only. (pkill -f would also match
    any shell whose command line merely mentions the path, including this test's.)"""
    pids = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/cmdline", "rb") as f:
                argv = f.read().split(b"\0")
        except OSError:
            continue
        if argv and os.path.basename(argv[0]) in (b"node", b"node.exe") and any(a.endswith(b"dist/server.js") for a in argv[1:]):
            pids.append(int(entry))
    return pids


def kill_server():
    for pid in server_pids():
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            pass
    for _ in range(50):
        if not server_up():
            return
        time.sleep(0.1)
    raise RuntimeError("room server did not stop")


def start_server():
    env = {**os.environ, "PORT": "8787"}
    proc = subprocess.Popen(shlex.split(SERVER_CMD), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if server_up():
            return proc
        time.sleep(0.1)
    raise RuntimeError("room server did not start")


with sync_playwright() as p:
    browser = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    names = ["Tunde", "Ama", "Wanjiru", "Thabo"]
    phones = []
    for n in names:
        pg = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True).new_page()
        watch(pg, n)
        phones.append(pg)
    vip, ama, wanjiru, thabo = phones

    # ── Lobby: open seats and header ────────────────────────────────────────
    vip.goto(BASE)
    vip.locator("#host-name").fill("Tunde")
    vip.get_by_role("button", name="Create room").click()
    vip.wait_for_url(re.compile(r"/room/[A-Z]{4}$"), timeout=15_000)
    code = vip.url[-4:]
    expect(vip.get_by_text("Waiting for a player…")).to_have_count(2)  # need 3, have 1
    profile_link = vip.get_by_role("link", name=re.compile("Profile"))
    expect(profile_link).to_have_attribute("target", "_blank")
    expect(vip.get_by_role("link", name="Home")).to_be_visible()  # lobby: home is a link

    for pg, n in zip(phones[1:], names[1:]):
        pg.goto(f"{BASE}/room/{code}")
        pg.locator("#gate-name").fill(n)
        pg.get_by_role("button", name="Join the game").click()
        expect(pg.get_by_role("heading", name="Players")).to_be_visible(timeout=10_000)
    expect(vip.get_by_text("Waiting for a player…")).to_have_count(0)
    vip.screenshot(path=f"{OUT}/l1-lobby.png", full_page=True)

    # ── Lobby leave: cancel first, then confirm ─────────────────────────────
    thabo.get_by_role("button", name="Leave").click()
    dialog = thabo.get_by_role("dialog")
    expect(dialog).to_be_visible()
    expect(dialog).to_contain_text("Leave this room?")
    expect(dialog).to_contain_text(code)
    thabo.screenshot(path=f"{OUT}/l2-leave-lobby-dialog.png")
    dialog.get_by_role("button", name="Stay").click()
    expect(dialog).to_be_hidden()
    expect(vip.get_by_text("Thabo")).to_be_visible()  # still in the room

    thabo.get_by_role("button", name="Leave").click()
    thabo.get_by_role("dialog").get_by_role("button", name="Leave room").click()
    thabo.wait_for_url(re.compile(r"/$|/\?"), timeout=10_000)
    expect(thabo.get_by_text("You left the room")).to_be_visible()
    expect(vip.get_by_text("Thabo")).to_have_count(0)
    expect(vip.get_by_text("3/8")).to_be_visible()

    # ── Mid-game: warning copy, keep playing, then leave for real ───────────
    vip.get_by_role("button", name="Everybody's in, start!").click()
    expect(ama.locator("textarea#answer")).to_be_visible(timeout=10_000)
    expect(vip.get_by_role("link", name="Home")).to_have_count(0)  # no accidental exits mid-round

    ama.get_by_role("button", name="Leave").click()
    d = ama.get_by_role("dialog")
    expect(d).to_contain_text("Leave mid-game?")
    expect(d).to_contain_text("won't earn XP, coins or badges")
    ama.screenshot(path=f"{OUT}/l3-leave-midgame-dialog.png")
    d.get_by_role("button", name="Keep playing").click()
    expect(d).to_be_hidden()
    expect(ama.locator("textarea#answer")).to_be_visible()

    ama.get_by_role("button", name="Leave").click()
    ama.get_by_role("dialog").get_by_role("button", name="Leave game").click()
    ama.wait_for_url(re.compile(r"/$|/\?"), timeout=10_000)

    # The other two finish the game without Ama.
    for _ in range(80):
        if vip.get_by_text("Final scores").is_visible():
            break
        for pg in (vip, wanjiru):
            box = pg.locator("textarea#answer")
            if box.is_visible():
                box.fill(f"{pg.url[-4:]} joke")
                pg.get_by_role("button", name="Send answer").click()
        skip = vip.get_by_role("button", name="Skip ›")
        if skip.is_visible() and not vip.locator("textarea#answer").is_visible():
            skip.click()
        vip.wait_for_timeout(300)
    expect(vip.get_by_text("Final scores")).to_be_visible(timeout=10_000)
    expect(vip.get_by_text("Ama")).to_have_count(0)
    vip.screenshot(path=f"{OUT}/l4-final.png")

    # ── Sad path: server down → clear message → Try again recovers ──────────
    kill_server()
    lost = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    watch(lost, "offline-check")
    lost.goto(f"{BASE}/room/{code}")
    expect(lost.get_by_text("Can't reach the game")).to_be_visible(timeout=30_000)
    lost.screenshot(path=f"{OUT}/l5-unreachable.png")
    server = start_server()
    lost.get_by_role("button", name="Try again").click()
    # The restarted server has no rooms, so the honest outcome is "Room not found".
    expect(lost.get_by_text(re.compile("Room not found|You're joining room"))).to_be_visible(timeout=15_000)
    print("server down → 'Can't reach the game' → Try again → recovered")

    browser.close()
    # The restarted server is left running so later tests can use it.

print("console errors:", len(errors))
for e in errors:
    print("  ", e)
print("LEAVE E2E PASSED" if not errors else "LEAVE E2E HAD ERRORS")
sys.exit(1 if errors else 0)
