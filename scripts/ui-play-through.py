"""Drives the real UI: one TV host screen + 3 phones play through a game.

Needs the room server and web app running. pip install playwright && playwright install chromium
Usage: python3 scripts/ui-play-through.py
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WEB_URL", "http://localhost:3000")
OUT = os.environ.get("SHOTS_DIR", "./ui-shots")
CHROME = os.environ.get("CHROME_PATH")  # optional: use a system Chrome instead of Playwright's
errors: list[str] = []


def watch(page, label):
    page.on("response", lambda r: print("HTTP", r.status, label, r.url) if r.status >= 400 else None)
    page.on("console", lambda m: errors.append(f"{label} console.{m.type}: {m.text} @ {m.location}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))


def answer_all(page):
    for _ in range(4):
        page.wait_for_timeout(300)
        # Done, or the whole room finished and the game already moved to voting.
        if page.get_by_text("Answers locked in!").is_visible() or page.get_by_text(re.compile(r"Matchup \d")).is_visible():
            return
        box = page.locator("textarea#answer")
        box.wait_for(timeout=10_000)
        prompt = page.locator("h2").first.inner_text()
        box.fill(f"Na {page.title()[:0]}wa o! ({prompt[:12]})")
        page.get_by_role("button", name="Send answer").click()
        page.wait_for_timeout(400)


def vote_if_possible(page):
    buttons = page.locator("button[aria-pressed]:not([disabled])")
    if buttons.count() > 0:
        buttons.first.click()


with sync_playwright() as p:
    os.makedirs(OUT, exist_ok=True)
    browser = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    tv = browser.new_context(viewport={"width": 1280, "height": 860}).new_page()
    watch(tv, "tv")
    tv.goto(BASE)
    tv.screenshot(path=f"{OUT}/01-landing.png", full_page=True)

    tv.get_by_text("📺 One big screen").click()
    tv.get_by_role("button", name="Ghana").click()  # add Ghana jokes
    tv.get_by_role("button", name="Create room").click()
    tv.wait_for_url(re.compile(r"/room/[A-Z]{4}$"), timeout=15_000)
    code = tv.url.rsplit("/", 1)[1]
    print("room", code)

    phones = []
    people = [("Tunde", "Nigeria"), ("Ama", "Ghana"), ("Wanjiru", "Kenya")]
    for i, (name, country) in enumerate(people):
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        watch(page, name)
        if i == 2:
            # Third player uses the landing page join form.
            page.goto(BASE)
            page.locator("#room-code").fill(code)
            page.locator("#join-name").fill(name)
            page.locator("form").first.get_by_text(country).click()
            page.get_by_role("button", name="Join", exact=True).click()
        else:
            # Others open the shared link, as if tapped from WhatsApp.
            page.goto(f"{BASE}/room/{code}")
            page.locator("#gate-name").fill(name)
            page.get_by_text(country).click()
            page.get_by_role("button", name="Join the game").click()
        expect(page.get_by_role("heading", name="Players")).to_be_visible(timeout=10_000)
        phones.append(page)

    expect(tv.get_by_text("Wanjiru")).to_be_visible()
    tv.screenshot(path=f"{OUT}/02-tv-lobby.png", full_page=True)
    phones[0].screenshot(path=f"{OUT}/03-phone-lobby-vip.png", full_page=True)

    # Refresh one phone mid-lobby: should resume via stored token, not show the join form.
    phones[1].reload()
    expect(phones[1].get_by_text("Waiting for the VIP")).to_be_visible(timeout=10_000)

    tv.get_by_role("button", name="Everybody's in, start!").click()
    expect(phones[0].locator("textarea#answer")).to_be_visible(timeout=10_000)
    phones[0].screenshot(path=f"{OUT}/04-phone-answering.png", full_page=True)
    tv.screenshot(path=f"{OUT}/05-tv-answering.png", full_page=True)

    for ph in phones:
        answer_all(ph)

    expect(tv.get_by_text("Vote on your phones!")).to_be_visible(timeout=10_000)
    tv.screenshot(path=f"{OUT}/06-tv-voting.png", full_page=True)
    voter = next(ph for ph in phones if ph.get_by_text("Tap the funniest answer").is_visible())
    voter.screenshot(path=f"{OUT}/07-phone-voting.png", full_page=True)
    for ph in phones:
        vote_if_possible(ph)

    expect(tv.get_by_text(re.compile(r"\+\d+")).first).to_be_visible(timeout=10_000)
    tv.screenshot(path=f"{OUT}/08-tv-reveal.png", full_page=True)
    phones[0].screenshot(path=f"{OUT}/09-phone-reveal.png", full_page=True)

    # Skip through the rest of the game from the TV.
    for _ in range(60):
        if tv.get_by_text("Final scores").is_visible():
            break
        skip = tv.get_by_role("button", name="Skip ›")
        if skip.is_visible():
            skip.click()
        tv.wait_for_timeout(250)
    expect(tv.get_by_text("Final scores")).to_be_visible(timeout=5_000)
    tv.screenshot(path=f"{OUT}/10-tv-final.png", full_page=True)
    phones[2].screenshot(path=f"{OUT}/11-phone-final.png", full_page=True)

    browser.close()

real_errors = [e for e in errors if "favicon" not in e]
print("console errors:", len(real_errors))
for e in real_errors:
    print("  ", e)
print("UI PLAY-THROUGH PASSED" if not real_errors else "UI PLAY-THROUGH HAD ERRORS")
sys.exit(1 if real_errors else 0)
