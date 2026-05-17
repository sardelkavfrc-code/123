import { computed } from "vue";
import type { MotionVariants } from "@vueuse/motion";
import { useSettingsStore } from "@/stores/settings";

type Variants = MotionVariants<"initial" | "enter">;

/**
 * Build motion variants that respect the user's performance preferences.
 * In motion-disabled mode, transitions become instant linear set so layouts
 * still react to state changes (visibility, position) but without animation.
 */
export function useMotion() {
  const settings = useSettingsStore();
  const disabled = computed(() => settings.motionDisabled);

  function spring<T extends Record<string, unknown>>(
    initial: T,
    enter: T,
    opts: {
      stiffness?: number;
      damping?: number;
      mass?: number;
      delay?: number;
    } = {}
  ): Variants {
    if (disabled.value) {
      return {
        initial,
        enter: { ...enter, transition: { duration: 0 } },
      } as Variants;
    }
    return {
      initial,
      enter: {
        ...enter,
        transition: {
          type: "spring",
          stiffness: opts.stiffness ?? 240,
          damping: opts.damping ?? 24,
          mass: opts.mass ?? 1,
          delay: opts.delay ?? 0,
        },
      },
    } as Variants;
  }

  function staggerSlideUp(distance = 12, delayStep = 0.04): (i: number) => Variants {
    return (i: number) =>
      spring(
        { opacity: 0, y: distance },
        { opacity: 1, y: 0 },
        { stiffness: 220, damping: 26, delay: i * delayStep }
      );
  }

  return { disabled, spring, staggerSlideUp };
}
