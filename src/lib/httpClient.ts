export async function httpCall(
  url: string,
  options: RequestInit = {}
) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    console.error('HTTP ERROR:', data);
    throw new Error(data?.error || 'Request failed');
  }

  return data;
}
