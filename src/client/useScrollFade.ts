import { useEffect, useRef } from 'react';

/**
 * Marks a scroll container with `data-fade-top` / `data-fade-bottom` while content is hidden past that
 * edge, so CSS (`.fade-y`) can fade the edge instead of cutting content off sharply.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.toggleAttribute('data-fade-top', el.scrollTop > 1);
      el.toggleAttribute('data-fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    const ro = new ResizeObserver(update);
    const observeChildren = () => { ro.disconnect(); ro.observe(el); for (const c of el.children) ro.observe(c); update(); };
    const mo = new MutationObserver(observeChildren);
    observeChildren();
    mo.observe(el, { childList: true });
    el.addEventListener('scroll', update, { passive: true });
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); mo.disconnect(); };
  }, []);
  return ref;
}
