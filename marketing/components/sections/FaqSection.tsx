"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

type FAQ = { question: string; answer: string };

/**
 * FAQ accordion. Emits FAQPage schema on the page that hosts it (caller is
 * responsible for the JSON-LD — keeps this component data-shape agnostic).
 */
export function FaqSection({
  eyebrow = "Questions",
  title = "Frequently asked questions",
  faqs,
  defaultOpenIndex = -1,
}: {
  eyebrow?: string;
  title?: string;
  faqs: FAQ[];
  defaultOpenIndex?: number;
}) {
  const [open, setOpen] = useState(defaultOpenIndex);
  if (!faqs?.length) return null;
  return (
    <section className="px-5 sm:px-8 py-12 sm:py-20">
      <div className="mx-auto max-w-[840px]">
        <div className="text-center">
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="display-lg mt-3">{title}</h2>
        </div>
        <div className="mt-10 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-sm">
          {faqs.map((f, i) => {
            const isOpen = i === open;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-[16px] font-semibold text-ink-900">
                    {f.question}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-ink-500 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="font-body px-6 pb-6 text-[15px] leading-relaxed text-ink-700">
                    {f.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
