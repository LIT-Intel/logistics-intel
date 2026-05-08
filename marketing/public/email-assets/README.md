# Email assets

Public images embedded in LIT Marketing campaign templates.

These files are deployed with the marketing site at
`https://www.logisticintel.com/email-assets/<filename>` so they render in
every email client (Gmail, Outlook desktop, Outlook web, Apple Mail, mobile
Gmail). The Campaign Composer references them by absolute URL — no hashed
build paths, no relative URLs, no `data:` blobs.

## Required files (LIT Marketing first wave)

| Filename | Used by | Sender mailbox |
|---|---|---|
| `company-intelligence.jpg` | Broker Email 1, Forwarder Email 1 | LIT Marketing |
| `contact-discovery.jpg` | Broker Email 3 | LIT Marketing |
| `pulse-ai-brief.jpg` | Forwarder Email 3 | LIT Marketing |

## Optional (queued for later sequences)

| Filename | Used by |
|---|---|
| `campaign-builder.jpg` | TBD |
| `rate-benchmark.jpg` | TBD |

## Specs

- **Format**: JPG (safest for email clients). WebP works on modern clients
  but Outlook 2016+ choke on it; stick with JPG for first wave.
- **Width**: 1200px max source, but rendered in email at 600px wide via
  the `<img width="600">` attribute.
- **Filesize target**: ≤ 350KB each. Compress before committing.
- **Visual style**: clean product screenshot, white background, no busy
  collages, no big marketing banners. Should feel like "I took a screenshot
  of my product and dropped it in this email."

## Replacing the placeholder images

Until real product screenshots land, the templates fall back to
`_pending-screenshot.svg` (an obviously-placeholder visual the recipient
will recognize as not-final). When you have real screenshots:

1. Drop them into this folder with the exact filenames above.
2. Commit + push.
3. Vercel rebuilds the marketing site automatically.
4. The Campaign Composer's template URLs pick up the new images on the
   next test send — no code changes needed.

That's it. The URL helper in `frontend/src/lib/emailAssets.ts` and the
template registry in `frontend/src/lib/campaignEmailTemplates.ts` already
point at these filenames.
