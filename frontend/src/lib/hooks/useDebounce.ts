import { useEffect, useState } from "react";
export function useDebounce<T>(value: T, delay = 300) {
  const [d, setD] = useState<T>(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}
