import type { ObjectDirective } from 'vue';

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const src = el.dataset.lazyBg;
        if (src && src !== 'null' && src !== 'undefined') {
          const img = new Image();
          img.src = src;
          img.decode()
            .then(() => {
              if (el.dataset.lazyBg === src) {
                el.style.backgroundImage = `url("${src}")`;
              }
            })
            .catch(() => {
              // Fallback to direct setting if decode fails (e.g. invalid format or browser error)
              if (el.dataset.lazyBg === src) {
                el.style.backgroundImage = `url("${src}")`;
              }
            });
        } else {
          el.style.backgroundImage = 'none';
        }
        observer.unobserve(el);
      }
    });
  },
  {
    rootMargin: '400px', // Load images in batches slightly before they appear
    threshold: 0,
  }
);

export const vLazyBg: ObjectDirective<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    if (binding.value) {
      el.dataset.lazyBg = binding.value;
      el.style.backgroundImage = 'none';
      observer.observe(el);
    } else {
      el.style.backgroundImage = 'none';
    }
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      if (binding.value) {
        el.dataset.lazyBg = binding.value;
        el.style.backgroundImage = 'none'; // reset so it loads again if needed
        observer.observe(el);
      } else {
        el.dataset.lazyBg = '';
        el.style.backgroundImage = 'none';
        observer.unobserve(el);
      }
    }
  },
  unmounted(el) {
    observer.unobserve(el);
  },
};
