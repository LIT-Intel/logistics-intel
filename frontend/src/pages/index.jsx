import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.replace("/search");
    }
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <p>
        Redirecting to Search… If not, <a href="/search">Go to Search</a>.
      </p>
    </main>
  );
}
