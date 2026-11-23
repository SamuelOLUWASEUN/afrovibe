"""Browser test: one person plays a whole game against bots, from the landing page.

Covers: the "Practice with bots" button, BOT labels, adding and removing bots, the
practice-game notice, a full game where bots answer and vote by themselves, and the
practice rewards card (XP only). Also checks bots never become VIP.

Needs the room server and web app running. Start the server with BOT_DELAY_PERCENT=10
so bots think faster (otherwise this test still passes, just slower):
  CHROME_PATH=... python3 scripts/ui-solo-bots.py
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WEB_URL", "http://localhost:3000")
OUT = os.environ.get("SHOTS_DIR", "./ui-shots")
CHROME = os.environ.get("CHROME_PATH")
errors: list[str] = []
os.makedirs(OUT, exist_ok=True)


def watch(page, label):
    page.on("console", lambda m: errors.append(f"{label}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))


def bot_rows(page):
    return page.locator("li", has_text="🤖 Bot")


with sync_playwright() as p:
    browser = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    me = ctx.new_page()
    watch(me, "me")
    me.goto(BASE)

    practice = me.get_by_role("button", name="🤖 Practice with bots")
    expect(practice).to_be_disabled()  # needs a name first
    me.locator("#host-name").fill("Kemi")
    expect(practice).to_be_enabled()
    me.locator("form").nth(1).screenshot(path=f"{OUT}/b1-landing-practice.png")
    practice.click()
    me.wait_for_url(re.compile(r"/room/[A-Z]{4}$"), timeout=15_000)

    # ── Lobby: two bots already seated, clearly labelled ──────────────────────
    expect(bot_rows(me)).to_have_count(2, timeout=10_000)
    expect(me.get_by_text("Practice game.")).to_be_visible()
    vip_row = me.locator("li", has_text="VIP")
    expect(vip_row).to_contain_text("Kemi")  # the person is VIP, never a bot
    start = me.get_by_role("button", name="Everybody's in, start!")
    expect(start).to_be_enabled()

    me.get_by_role("button", name="Add a bot").click()
    expect(bot_rows(me)).to_have_count(3)
    first_bot = bot_rows(me).first
    bot_name = first_bot.locator("span.truncate").inner_text()
    first_bot.get_by_role("button", name=f"Remove {bot_name}").click()  # bots go without a dialog
    expect(bot_rows(me)).to_have_count(2)
    expect(me.get_by_role("dialog")).to_have_count(0)
    me.screenshot(path=f"{OUT}/b2-lobby-with-bots.png", full_page=True)

    # ── Play the whole game ─────────────────────────────────────────────────
    start.click()
    answered = voted = 0
    saw_bot_votes = False
    for _ in range(900):
        if me.get_by_text("Final scores").is_visible():
            break
        box = me.locator("textarea#answer")
        if box.is_visible():
            box.fill(f"Kemi's answer number {answered + 1}")
            me.get_by_role("button", name="Send answer").click()
            answered += 1
            me.wait_for_timeout(300)
            continue
        options = me.locator("button[aria-pressed='false']:not([disabled])")
        if me.get_by_text("Tap the funniest answer").is_visible() and options.count() > 0:
            options.first.click()
            voted += 1
            if voted == 1:
                me.screenshot(path=f"{OUT}/b3-voting-vs-bots.png", full_page=True)
            me.wait_for_timeout(300)
            continue
        # Bots' votes appear as voter avatars on the reveal; one sighting is enough.
        if not saw_bot_votes and me.get_by_text(re.compile(r"\+\d+")).first.is_visible():
            saw_bot_votes = True
            me.screenshot(path=f"{OUT}/b4-reveal-vs-bots.png", full_page=True)
        me.wait_for_timeout(250)

    expect(me.get_by_text("Final scores")).to_be_visible(timeout=5_000)
    print(f"answered {answered} prompts, voted {voted} times")
    assert answered >= 5, f"expected 5 answers (2+2+1), got {answered}"
    assert voted >= 1, "never got to vote"
    assert saw_bot_votes, "never saw a reveal"

    # ── Practice rewards: XP only ───────────────────────────────────────────
    rewards = me.get_by_role("heading", name="Your rewards")
    expect(rewards).to_be_visible(timeout=10_000)
    expect(me.get_by_text("Practice game: XP only")).to_be_visible()
    expect(me.get_by_text("+0 🪙")).to_be_visible()
    expect(me.get_by_text(re.compile(r"\+\d+ XP"))).to_be_visible()
    expect(me.get_by_text("🤖 Bot").first).to_be_visible()  # bots labelled on the final screen too
    me.screenshot(path=f"{OUT}/b5-final-practice.png", full_page=True)

    browser.close()

print("console errors:", len(errors))
for e in errors:
    print("  ", e)
print("UI SOLO-BOTS PASSED" if not errors else "UI SOLO-BOTS HAD ERRORS")
sys.exit(1 if errors else 0)
