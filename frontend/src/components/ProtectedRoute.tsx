import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadError } from "./Feedback";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, authError, retryAuth } = useAuth();

  if (loading) return <div className="page-center">Loading...</div>;
  // Signed in, but the server couldn't be reached to confirm it: offer a retry
  // instead of sending the user to the login page.
  if (!user && authError) return <LoadError message={authError} onRetry={retryAuth} />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
