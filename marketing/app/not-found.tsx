import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <section className="px-5 sm:px-8 pt-20 pb-32">
        <div className="mx-auto max-w-[640px] text-center">
          <div className="lit-pill mx-auto inline-flex">
            <span className="dot" />
            404
          </div>
          <h1 className="display-xl mt-6">
            That page <span className="grad-text">drifted off-lane.</span>
          </h1>
          <p className="lead mx-auto mt-5 max-w-[480px]">
            We couldn't find what you're looking for. Try the homepage, or search the blog and glossary.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              Back home
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/blog"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white px-6 text-[15px] font-semibold text-ink-900 hover:bg-ink-25"
            >
              <Search className="h-4 w-4" />
              Read the blog
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
