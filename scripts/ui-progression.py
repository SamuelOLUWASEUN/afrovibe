"""End-to-end progression test in a real browser:
3 phones (remote mode) play a full game -> rewards card -> profile shows XP/badges ->
shop purchase with earned coins -> equip -> reactions reach other phones.

Needs the room server (with a database) and the web app running.
Usage: CHROME_PATH=/usr/bin/google-chrome python3 scripts/ui-progression.py
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WEB_URL", "http://localhost:3000")
OUT = os.environ.get("SHOTS_DIR", "./ui-shots")
CHROME = os.environ.get("CHROME_PATH")
errors: list[str] = []


def watch(page, label):
    page.on("console", lambda m: errors.append(f"{label}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))


def answer_all(page):
    for _ in range(4):
        page.wait_for_timeout(300)
        if page.get_by_text("Answers locked in!").is_visible() or page.get_by_text(re.compile(r"Matchup \d")).is_visible():
            return
        box = page.locator("textarea#answer")
        if not box.is_visible():
            return
        box.fill("Na wa o, my people!")
        page.get_by_role("button", name="Send answer").click()


def play_round_phase(phones, vip):
    """Advance one step of the game, whatever phase we're in."""
    page = vip
    if page.locator("textarea#answer").is_visible() or page.get_by_text("Answers locked in!").is_visible():
        for ph in phones:
            answer_all(ph)
        return
    voted = False
    for ph in phones:
        # Vote buttons are the tall answer cards (min-h-20); reaction buttons are small circles.
        # Vote once per battle. Already-voted phones keep the other answer enabled
        # (players may change their mind), so check for an existing choice first.
        if ph.locator("button.min-h-20[aria-pressed='true']").count() > 0:
            continue
        vote = ph.locator("button.min-h-20:not([disabled])")
        if vote.count() > 0:
            vote.first.click(timeout=3_000)
            voted = True
    if not voted:
        skip = vip.get_by_role("button", name="Skip ›")
        if skip.is_visible():
            skip.click()
    vip.wait_for_timeout(300)


os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    people = [("Tunde", "Nigeria"), ("Ama", "Ghana"), ("Wanjiru", "Kenya")]
    phones = []
    for name, _ in people:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        watch(page, name)
        phones.append(page)
    vip = phones[0]

    # Host in "Everyone on phones" mode (default).
    vip.goto(BASE)
    vip.locator("#host-name").fill(people[0][0])
    vip.get_by_role("button", name="Create room").click()
    vip.wait_for_url(re.compile(r"/room/[A-Z]{4}$"), timeout=15_000)
    code = vip.url.rsplit("/", 1)[1]
    print("room", code)

    for page, (name, country) in zip(phones[1:], people[1:]):
        page.goto(f"{BASE}/room/{code}")
        page.locator("#gate-name").fill(name)
        page.get_by_text(country).click()
        page.get_by_role("button", name="Join the game").click()
        expect(page.get_by_role("heading", name="Players")).to_be_visible(timeout=10_000)

    expect(vip.get_by_text("Lv 1").first).to_be_visible()
    vip.get_by_role("button", name="Everybody's in, start!").click()

    reacted = False
    for _ in range(120):
        if vip.get_by_text("Final scores").is_visible():
            break
        if not reacted and phones[1].get_by_role("button", name="React 😂").is_visible():
            phones[1].get_by_role("button", name="React 😂").click()
            # The reaction should float up on the other phones.
            expect(vip.get_by_text("😂").first).to_be_visible(timeout=3_000)
            vip.screenshot(path=f"{OUT}/p1-reaction.png")
            reacted = True
        play_round_phase(phones, vip)
    expect(vip.get_by_text("Final scores")).to_be_visible(timeout=10_000)
    assert reacted, "never saw the reaction bar"

    for ph in phones:
        expect(ph.get_by_role("heading", name="Your rewards")).to_be_visible(timeout=10_000)
    expect(vip.get_by_text("Welcome to the Party")).to_be_visible()
    vip.screenshot(path=f"{OUT}/p2-rewards.png", full_page=True)

    # Profile page reflects the game.
    prof = vip.context.new_page()
    watch(prof, "profile")
    prof.goto(f"{BASE}/profile")
    expect(prof.get_by_role("heading", name=re.compile("Tunde"))).to_be_visible(timeout=10_000)
    expect(prof.get_by_text("Earned").first).to_be_visible()
    coins_text = prof.locator("text=/🪙 \\d+/").first.inner_text()
    coins = int(re.search(r"\d+", coins_text).group())
    print("coins after one game:", coins)
    assert coins >= 100, f"expected enough coins for a 100-coin item, got {coins}"
    prof.screenshot(path=f"{OUT}/p3-profile.png", full_page=True)

    # Shop: buy and equip a name colour with earned coins.
    prof.goto(f"{BASE}/shop")
    prof.get_by_role("tab", name="Name colours").click()
    emerald = prof.locator("div").filter(has=prof.get_by_text("Emerald", exact=True)).filter(has=prof.get_by_role("button")).last
    emerald.get_by_role("button", name=re.compile("🪙 100")).click()
    expect(prof.get_by_text("Emerald is yours!")).to_be_visible(timeout=10_000)
    emerald.get_by_role("button", name="Equip").click()
    expect(prof.get_by_text("Emerald equipped")).to_be_visible(timeout=10_000)
    # The header balance must update immediately after spending.
    expect(prof.get_by_role("navigation").get_by_text(re.compile(r"🪙 \d+"))).to_have_text(f"🪙 {coins - 100}")
    prof.screenshot(path=f"{OUT}/p4-shop.png", full_page=True)

    prof.get_by_role("tab", name="Get coins").click()
    expect(prof.get_by_text("Buying coins isn't switched on yet")).to_be_visible()
    prof.screenshot(path=f"{OUT}/p5-coins.png", full_page=True)

    # Play again: the VIP rejoins the lobby; cosmetics apply on the next room join.
    vip.get_by_role("button", name=re.compile("Play again")).click()
    expect(vip.get_by_role("heading", name="Players")).to_be_visible(timeout=10_000)
    browser.close()

real = [e for e in errors if "favicon" not in e]
print("console errors:", len(real))
for e in real:
    print("  ", e)
print("PROGRESSION E2E PASSED" if not real else "PROGRESSION E2E HAD ERRORS")
sys.exit(1 if real else 0)
