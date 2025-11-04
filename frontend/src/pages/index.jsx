import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/search");
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <p>
        Redirecting to Search… If not, <a href="/search">Go to Search</a>.
      </p>
    </main>
  );
}
