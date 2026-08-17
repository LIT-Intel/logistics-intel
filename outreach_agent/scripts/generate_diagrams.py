from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DOCS.mkdir(exist_ok=True)


def diagram(path: Path, title: str, boxes: list[tuple[str, str]]) -> None:
    image = Image.new("RGB", (1400, 760), "#081225")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)
    small = ImageFont.load_default(size=18)
    draw.text((60, 45), title, fill="#F8FAFC", font=font)
    width = 250
    gap = 25
    y = 260
    for index, (heading, detail) in enumerate(boxes):
        x = 55 + index * (width + gap)
        draw.rounded_rectangle((x, y, x + width, y + 190), radius=18, fill="#111D33", outline="#3B82F6", width=3)
        draw.text((x + 18, y + 22), heading, fill="#FFFFFF", font=small)
        words = detail.split()
        lines, line = [], ""
        for word in words:
            if len(line + " " + word) > 24:
                lines.append(line)
                line = word
            else:
                line = (line + " " + word).strip()
        lines.append(line)
        draw.multiline_text((x + 18, y + 70), "\n".join(lines), fill="#9DB4D5", font=small, spacing=7)
        if index < len(boxes) - 1:
            draw.line((x + width, y + 95, x + width + gap - 5, y + 95), fill="#60A5FA", width=4)
            draw.polygon([(x + width + gap - 5, y + 95), (x + width + gap - 17, y + 87), (x + width + gap - 17, y + 103)], fill="#60A5FA")
    image.save(path)


diagram(
    DOCS / "agent-interactions.png",
    "LIT Outreach Agent — interaction boundary",
    [
        ("LIT", "Supabase supplies authorized company contact campaign and history context"),
        ("Agent", "Drafts or stops using policies evidence and structured output"),
        ("Tone gate", "Rejects AI clichés pressure invented facts and weak copy"),
        ("Approval", "A human approves edits or rejects every new draft"),
        ("Unipile", "Later sends only approved actions through server-side controls"),
    ],
)
diagram(
    DOCS / "agent-sequence.png",
    "LIT Outreach Agent — run sequence",
    [
        ("Validate", "Identity workspace suppression and channel requirements"),
        ("Policies", "Load channel and approval rules with typed tools"),
        ("Generate", "Return one grounded structured draft decision"),
        ("Evaluate", "Score human tone evidence length and compliance"),
        ("Result", "Approve queue revise twice or escalate safely"),
    ],
)
