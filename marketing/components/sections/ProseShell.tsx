import { ProseRenderer } from "@/lib/portableText";

/** Centered narrow column for long-form content. */
export function ProseShell({ value }: { value: any }) {
  if (!value) return null;
  return (
    <section className="px-8 py-10">
      <div className="mx-auto max-w-[760px]">
        <ProseRenderer value={value} />
      </div>
    </section>
  );
}
