export async function getFilterOptions() {
  const base = import.meta.env.VITE_API_BASE;
  const resp = await fetch(`${base}/public/getFilterOptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!resp.ok) throw new Error(`getFilterOptions HTTP ${resp.status}`);
  return resp.json();
}
