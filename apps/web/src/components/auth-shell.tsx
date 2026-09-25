import { cn } from "@anlg/utils";

export const authInputClassName = cn([
  "h-12 w-full rounded-xl border border-[#d9d1c5] bg-white px-4",
  "text-[#181613] placeholder:text-[#9a9082]",
  "transition-colors hover:border-[#b9ae9f]",
  "focus:border-[#181613] focus:ring-2 focus:ring-[#181613]/10 focus:outline-hidden",
]);

export const authPrimaryButtonClassName = cn([
  "flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full px-5",
  "bg-[#181613] text-sm font-medium text-white",
  "transition-colors hover:bg-[#4f4940]",
  "focus-visible:ring-2 focus-visible:ring-[#181613] focus-visible:ring-offset-2 focus-visible:outline-hidden",
  "disabled:cursor-not-allowed disabled:opacity-50",
]);

export const authSecondaryButtonClassName = cn([
  "flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-[#d9d1c5] bg-white px-5",
  "text-sm font-medium text-[#181613]",
  "transition-colors hover:bg-[#f7f4ef]",
  "focus-visible:ring-2 focus-visible:ring-[#181613] focus-visible:ring-offset-2 focus-visible:outline-hidden",
  "disabled:cursor-not-allowed disabled:opacity-50",
]);

export const authNoticeClassName =
  "rounded-xl border border-[#e5ddcf] bg-[#f7f4ef] p-4 text-center";

export function AuthShell({
  title,
  description,
  showEyebrow = true,
  children,
}: {
  title: string;
  description?: string;
  showEyebrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-[#181613]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-5 sm:px-8">
        <div className="grid flex-1 items-center gap-12 py-10 md:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-20 lg:py-16">
          <section className="hidden md:block">
            <p className="text-2xl leading-none font-normal text-[#756b5d]">
              Research workspace for clinical evidence
            </p>
            <h2 className="mt-5 max-w-[620px] text-6xl leading-[0.95] font-normal tracking-[-0.045em] text-balance lg:text-7xl">
              Clinical notes grounded in{" "}
              <mark className="bg-[#fff0b3] px-1 text-[#181613]">
                traceable evidence.
              </mark>
            </h2>
          </section>

          <section className="mx-auto w-full max-w-[440px] overflow-hidden rounded-[24px] border border-[#e5ddcf] bg-white shadow-[0_24px_80px_rgba(24,22,19,0.10)]">
            <header className="border-b border-[#ede7dc] px-6 py-7 sm:px-8 sm:py-8">
              {showEyebrow && (
                <p className="text-sm leading-none font-normal tracking-[0.08em] text-[#756b5d] uppercase">
                  Local-first by default
                </p>
              )}
              <h1
                className={cn([
                  "text-4xl leading-none font-normal tracking-[-0.035em] text-[#181613]",
                  showEyebrow && "mt-3",
                ])}
              >
                {title}
              </h1>
              {description && (
                <p className="mt-3 text-sm leading-6 text-[#756b5d]">
                  {description}
                </p>
              )}
            </header>

            <div className="p-6 sm:p-8">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
