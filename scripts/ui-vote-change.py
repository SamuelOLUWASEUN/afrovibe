"""Browser test: a voter taps one answer, changes their mind, and only the final vote counts.

Needs the room server and web app running.
Usage: CHROME_PATH=/usr/bin/google-chrome python3 scripts/ui-vote-change.py
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

with sync_playwright() as p:
    browser = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    names = ["Tunde", "Ama", "Wanjiru", "Thabo"]
    phones = []
    for name in names:
        page = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True).new_page()
        page.on("console", lambda m, n=name: errors.append(f"{n}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
        phones.append(page)

    vip = phones[0]
    vip.goto(BASE)
    vip.locator("#host-name").fill(names[0])
    vip.get_by_role("button", name="Create room").click()
    vip.wait_for_url(re.compile(r"/room/[A-Z]{4}$"), timeout=15_000)
    code = vip.url[-4:]
    for page, name in zip(phones[1:], names[1:]):
        page.goto(f"{BASE}/room/{code}")
        page.locator("#gate-name").fill(name)
        page.get_by_role("button", name="Join the game").click()
        expect(page.get_by_role("heading", name="Players")).to_be_visible(timeout=10_000)
    vip.get_by_role("button", name="Everybody's in, start!").click()

    # Everyone answers with text that identifies them.
    for page, name in zip(phones, names):
        for i in range(2):
            box = page.locator("textarea#answer")
            box.wait_for(timeout=10_000)
            box.fill(f"{name} answer {i + 1}")
            page.get_by_role("button", name="Send answer").click()
            page.wait_for_timeout(400)
            if not box.is_visible():
                break

    # Find a phone that can vote in the first battle.
    expect(vip.get_by_text(re.compile(r"Matchup 1 of"))).to_be_visible(timeout=10_000)
    voter_idx = next(i for i, ph in enumerate(phones) if ph.get_by_text("Tap the funniest answer").is_visible())
    voter = phones[voter_idx]
    options = voter.locator("button.min-h-20")
    first_text = options.nth(0).inner_text().split("\n")[0]
    second_text = options.nth(1).inner_text().split("\n")[0]

    options.nth(0).click()
    expect(options.nth(0)).to_have_attribute("aria-pressed", "true")
    expect(voter.get_by_text("Changed your mind?")).to_be_visible()
    options.nth(1).click()  # change of mind
    expect(options.nth(1)).to_have_attribute("aria-pressed", "true")
    expect(options.nth(0)).to_have_attribute("aria-pressed", "false")
    voter.wait_for_timeout(400)  # let the colour transition finish
    voter.screenshot(path=f"{OUT}/vote-changed.png", full_page=True)

    # Let the voting timer close (the other voter doesn't vote), then check the reveal.
    expect(vip.get_by_text(re.compile(r"\+\d+")).first).to_be_visible(timeout=30_000)
    voter_name = names[voter_idx]
    winning_card = vip.locator("div.rounded-2xl").filter(has_text=second_text).filter(has_text="vote").first
    losing_card = vip.locator("div.rounded-2xl").filter(has_text=first_text).filter(has_text="vote").first
    expect(winning_card).to_contain_text(f"1 vote: {voter_name}")
    expect(losing_card).to_contain_text("No votes")
    vip.screenshot(path=f"{OUT}/vote-change-reveal.png", full_page=True)
    print(f"{voter_name} switched from '{first_text}' to '{second_text}'; reveal counted only the final vote")
    browser.close()

real = [e for e in errors if "favicon" not in e]
print("console errors:", len(real))
for e in real:
    print("  ", e)
print("VOTE-CHANGE E2E PASSED" if not real else "VOTE-CHANGE E2E HAD ERRORS")
sys.exit(1 if real else 0)
