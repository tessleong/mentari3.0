import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const personalities = [
  "01-nerdy",
  "02-sporty",
  "03-artsy",
  "04-bookish",
  "05-cool",
  "06-preppy",
  "07-geeky",
  "08-dreamy",
  "09-grumpy",
  "10-cheerful",
  "11-shy",
  "12-confident",
  "13-sleepy",
  "14-energetic",
  "15-serious",
  "16-playful",
  "17-curious",
  "18-dramatic",
  "19-rebellious",
  "20-fancy",
  "21-outdoorsy",
  "22-zen",
  "23-quirky",
  "24-studious",
] as const;
export type AgentRole = "research" | "explainer" | "scribe";
export const agentLabels = {
  research: "Research Agent",
  explainer: "Explainer Agent",
  scribe: "Scribe Agent",
};
export const usePersonalities = create(
  persist<{
    avatars: Record<AgentRole, string>;
    setAvatar: (role: AgentRole, avatar: string) => void;
  }>(
    (set) => ({
      avatars: {
        research: "01-nerdy",
        explainer: "10-cheerful",
        scribe: "04-bookish",
      },
      setAvatar: (role, avatar) =>
        set((state) => ({ avatars: { ...state.avatars, [role]: avatar } })),
    }),
    { name: "mentari-agent-personalities-v1" },
  ),
);

export function PersonalityAvatar({
  role,
  size = 64,
  avatar,
}: {
  role: AgentRole;
  size?: number;
  avatar?: string;
}) {
  const selected = usePersonalities((state) => state.avatars[role]);
  const name =
    personalities.find((item) => item === (avatar ?? selected)) ??
    personalities[0];
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 90, damping: 18 });
  const springY = useSpring(y, { stiffness: 90, damping: 18 });
  useEffect(() => {
    if (reduced || avatar) return;
    const move = (event: PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      x.set(
        Math.max(
          -7,
          Math.min(7, (event.clientX - rect.x - rect.width / 2) / 45),
        ),
      );
      y.set(
        Math.max(
          -5,
          Math.min(5, (event.clientY - rect.y - rect.height / 2) / 60),
        ),
      );
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [avatar, reduced, x, y]);
  return (
    <motion.span
      ref={ref}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white"
      style={{
        width: size,
        height: size,
        x: reduced ? 0 : springX,
        y: reduced ? 0 : springY,
      }}
    >
      <picture>
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet={`/assets/personality-avatars/${name}.png`}
        />
        <img
          src={`/assets/personality-avatars/${name}.${avatar ? "png" : "webp"}`}
          width={size}
          height={size}
          alt=""
          draggable={false}
        />
      </picture>
    </motion.span>
  );
}

export function PersonalitySelector() {
  const avatars = usePersonalities((state) => state.avatars);
  const setAvatar = usePersonalities((state) => state.setAvatar);
  return (
    <section className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold">Agent personalities</h3>
      {(Object.keys(agentLabels) as AgentRole[]).map((role) => (
        <div key={role}>
          <h4 className="mb-2 text-sm font-medium">{agentLabels[role]}</h4>
          <div
            role="radiogroup"
            aria-label={agentLabels[role]}
            className="flex flex-wrap gap-2"
          >
            {personalities.map((avatar) => (
              <button
                key={avatar}
                type="button"
                role="radio"
                aria-checked={avatars[role] === avatar}
                aria-label={avatar.slice(3)}
                title={avatar.slice(3)}
                className={`rounded-lg border p-1 ${avatars[role] === avatar ? "border-foreground" : "hover:bg-accent border-transparent"}`}
                onClick={() => setAvatar(role, avatar)}
              >
                <PersonalityAvatar role={role} avatar={avatar} size={44} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
