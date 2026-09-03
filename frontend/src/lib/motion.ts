/**
 * LIT shared motion system — Apple "Designing Fluid Interfaces" translated to
 * the web (framer-motion). ONE source of truth for spring feel across the app.
 *
 * Apple deliberately reduced the physics triplet (mass/stiffness/damping) to
 * two designer-friendly knobs:
 *   • damping ratio — overshoot. 1.0 = critically damped (no bounce). <1 bounces.
 *   • response      — how fast the value reaches target, in seconds. NOT duration.
 *
 * framer-motion's spring `{ bounce, duration }` maps closely:
 *   • bounce   ≈ (1 - dampingRatio)   → 0 = critically damped, ~0.2 = a little bounce
 *   • duration ≈ response             → perceived settle time in seconds
 *
 * House rule (Apple §4): critically damped (bounce 0) EVERYWHERE by default.
 * Reserve bounce ONLY for momentum-driven, physical interactions — a flick, a
 * throw, a drag release. Overshoot on a menu that just faded in feels wrong;
 * overshoot on a card you flicked feels right.
 */
import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

/** Concrete spring presets. Values mirror the ones Apple ships (see skill §4). */
export const springs = {
  /** Default UI move / reposition — critically damped, no overshoot. (§4 PiP) */
  default: { type: "spring", bounce: 0, duration: 0.4 } as Transition,
  /** Snappy default for small, frequent changes (toggles, chips, hovers). */
  snappy: { type: "spring", bounce: 0, duration: 0.28 } as Transition,
  /** Drawer / sheet — a touch of bounce because a drag/throw precedes it. (§4) */
  sheet: { type: "spring", bounce: 0.18, duration: 0.34 } as Transition,
  /** Momentum / flick release — most bounce we ever use. Only after a gesture. */
  momentum: { type: "spring", bounce: 0.22, duration: 0.4 } as Transition,
  /** Rotation — slight bounce, matches Apple's 0.8 damping / 0.4 response. */
  rotate: { type: "spring", bounce: 0.2, duration: 0.4 } as Transition,
} satisfies Record<string, Transition>;

/** Non-spring easing for opacity/color-only fades (dialogs, tooltips). */
export const easings = {
  /** Apple-ish decelerate — fast out of the gate, gentle settle. */
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** Symmetric in-out for reversible transitions (mirror the path — §7). */
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

/**
 * Reusable variants. `hidden`/`visible`/`exit` so they drop straight into
 * <motion.div variants=… initial="hidden" animate="visible" exit="exit">.
 */
export const variants = {
  /** Fade + short rise. The workhorse for content entering a page/list. */
  fadeInUp: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: springs.default },
    exit: { opacity: 0, y: 8, transition: { duration: 0.15, ease: easings.out } },
  } satisfies Variants,

  /** Materialize (§12) — scale + fade together, so a surface reads as arriving,
      not just appearing. Use for popovers/menus anchored to a trigger. */
  scaleIn: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1, transition: springs.snappy },
    exit: { opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: easings.out } },
  } satisfies Variants,

  /** Scrim / overlay — opacity only, never moves. */
  overlay: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2, ease: easings.out } },
    exit: { opacity: 0, transition: { duration: 0.15, ease: easings.out } },
  } satisfies Variants,
};

/** Stagger container for lists — children reveal in quick succession. */
export const staggerContainer = (stagger = 0.04): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

/**
 * Reduced-motion-aware spring. Call inside a component; when the user asks for
 * reduced motion (Apple §14) it returns an instant/opacity-only transition so
 * springs and travel are dropped, but comprehension feedback stays.
 */
export function useSpring(preset: keyof typeof springs = "default"): Transition {
  const reduce = useReducedMotion();
  if (reduce) return { duration: 0 };
  return springs[preset];
}

/** Same idea for variants — collapses travel/scale to a pure cross-fade. */
export function useVariants(v: keyof typeof variants): Variants {
  const reduce = useReducedMotion();
  if (!reduce) return variants[v];
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  };
}

/**
 * Apple §6 — momentum projection. Given a release velocity (px/s), project
 * where a flick would naturally come to rest, exactly like scroll deceleration.
 * Snap to the nearest target of THAT projected point, not the release point.
 * decelerationRate ≈ 0.998 for normal scroll feel; 0.99 = snappier.
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/**
 * Apple §9 — rubber-band resistance past a boundary. The further past the
 * bound the user drags, the less the element follows (real things slow before
 * they stop). `dimension` = size of the axis; tune with `constant`.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export { useReducedMotion };
