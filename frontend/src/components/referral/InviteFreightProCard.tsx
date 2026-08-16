/**
 * "Invite a freight pro" card (Phase 8 referral loop).
 *
 * In-app surface that lets any logged-in user invite another freight
 * professional. The personal link reuses the affiliate /?ref=<code> capture +
 * claim path — the only new piece is the member ref_code minted by the
 * lit_get_or_create_referral_code RPC. Reward messaging is intelligence
 * credits, earned when the invitee STARTS using LIT (activation), not on click.
 */
import { useCallback, useEffect, useState } from "react";
import { Gift, Copy, Check, Share2, Loader2 } from "lucide-react";
import {
  getOrCreateReferralCode,
  listMyReferralRewards,
  type ReferralRewardRow,
} from "@/api/referral";

const SHARE_TITLE = "Try LIT — logistics intelligence + CRM";
const SHARE_TEXT =
  "I use LIT to find and win freight accounts. Grab a free look:";

export default function InviteFreightProCard() {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rewards, setRewards] = useState<ReferralRewardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [code, rws] = await Promise.all([
        getOrCreateReferralCode(),
        listMyReferralRewards(),
      ]);
      if (cancelled) return;
      if (code.ok) {
        setLink(code.link);
        setError(null);
      } else {
        setError(code.reason);
      }
      setRewards(rws);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onCopy = useCallback(() => {
    if (!link) return;
    try {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — link is still selectable in the input */
    }
  }, [link]);

  const onShare = useCallback(() => {
    if (!link) return;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      nav.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: link }).catch(() => {
        /* user cancelled */
      });
    } else {
      onCopy();
    }
  }, [link, onCopy]);

  const rewardedCount = rewards.filter((r) => r.status === "rewarded").length;
  const pendingCount = rewards.filter(
    (r) => r.status === "pending" || r.status === "activated",
  ).length;
  const creditsEarned = rewards
    .filter((r) => r.status === "rewarded")
    .reduce((sum, r) => sum + (Number(r.credits) || 0), 0);

  return (
    <div
      className="rounded-2xl border border-slate-200 p-4 md:p-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(6,182,212,0.06) 100%), #FFFFFF",
        boxShadow: "0 10px 30px -22px rgba(15, 23, 42, 0.24)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
          <Gift className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[15px] font-bold text-slate-900"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Invite another freight professional
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Earn intelligence credits when they start using LIT.
          </p>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing your link…
            </div>
          ) : error ? (
            <p className="mt-4 text-[12px] text-slate-400">
              Your referral link isn't available yet. Please try again later.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={link ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-700"
                  aria-label="Your referral link"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onShare}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-colors"
                    style={{
                      background: "linear-gradient(180deg,#3B82F6,#2563EB)",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </button>
                </div>
              </div>

              {rewards.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-500">
                  <span>
                    <span className="font-semibold text-slate-700">
                      {rewardedCount}
                    </span>{" "}
                    rewarded
                  </span>
                  <span>
                    <span className="font-semibold text-slate-700">
                      {pendingCount}
                    </span>{" "}
                    pending activation
                  </span>
                  <span>
                    <span className="font-semibold text-slate-700">
                      {creditsEarned}
                    </span>{" "}
                    credits earned
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
