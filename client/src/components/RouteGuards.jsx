import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

function FullScreenSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <Loader2 className="h-8 w-8 text-primary-ink" />
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  return user ? children : <Navigate to="/login" replace />;
}

export function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  return user ? <Navigate to="/" replace /> : children;
}
