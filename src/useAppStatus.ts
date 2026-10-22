import { useEffect, useState } from "react";

export function useAppStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(() => {
          if (alive) setOfflineReady(true);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  return { online, offlineReady };
}
