import { useEffect, useState } from 'react';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const inr = (n, digits = 2) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const units = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${FULL_MONTHS[m - 1]} ${y}`;
};

/** Smoothly counts from 0 up to `value`. */
export function useCountUp(value, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}
