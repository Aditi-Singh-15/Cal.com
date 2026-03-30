import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getAuthMe } from "../lib/api";

export default function RequireAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadMe() {
      try {
        await getAuthMe();
        if (isMounted) {
          setAuthed(true);
        }
      } catch {
        if (isMounted) {
          setAuthed(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadMe();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="page">
        <p className="muted">Checking session...</p>
      </section>
    );
  }

  if (!authed) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
