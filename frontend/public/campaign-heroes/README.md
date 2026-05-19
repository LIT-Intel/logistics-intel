# Campaign hero images

These 3 images are referenced by the 8 active rows in
`lit_marketing_email_templates` (forwarder + broker sequences).

| Filename | Used by | Source image |
|---|---|---|
| `lit-pulse-search-hero.png` | F1, B1 (intros) | "Find your next customer in seconds" — Pulse AI Search dashboard mockup |
| `lit-account-card-hero.png` | F2, B2 (proof) | "The first 30 seconds of account research, done." — Acme Industries account card |
| `lit-velocity-hero.png` | F3, B3 (capability) | "Velocity: Five steps from question to closed deal." — 5-day → 20-min timeline |

## Specs

- Format: PNG with sRGB color profile
- Recommended dimensions: 1376 x 768 (2x of 688 x 384 display size)
- Max file size: 200 KB each (use https://tinypng.com to compress; emails get bounced if assets are heavy)
- Background: design transparent or warm-cream (#FFFBF6 in the email) so the image blends with the shell

## Publishing

Drop the 3 PNGs into this folder, then:

```bash
git add frontend/public/campaign-heroes/
git commit -m "chore(campaign): hero images for forwarder + broker sequences"
git push
```

Vercel auto-deploys; images become reachable at:

- https://app.logisticintel.com/campaign-heroes/lit-pulse-search-hero.png
- https://app.logisticintel.com/campaign-heroes/lit-account-card-hero.png
- https://app.logisticintel.com/campaign-heroes/lit-velocity-hero.png

Until the PNGs are uploaded, the emails render with a broken-image
placeholder in the hero slot. The copy and CTA still work; visual impact
is just degraded. F4/B4 closers don't use any image so they always render
clean.
