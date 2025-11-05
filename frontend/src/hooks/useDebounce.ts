import { useEffect, useState } from 'react';

/**
 * Returns a debounced value that updates only after `delay` ms.
 * Usage:
 *   const q = useDebounce(keyword, 300);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
export default useDebounce;
