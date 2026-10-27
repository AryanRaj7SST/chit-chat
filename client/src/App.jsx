import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ProtectedRoute, PublicRoute } from "./components/RouteGuards";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChatPage from "./pages/ChatPage";

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Toaster position="top-center" toastOptions={{ duration: 3000,
          style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", boxShadow: "var(--panel-shadow)", fontSize: "14px", animation: "none", transition: "none" },
          success: { iconTheme: { primary: "var(--primary-ink)", secondary: "var(--surface)" } },
          error: { iconTheme: { primary: "var(--danger-ink)", secondary: "var(--surface)" } },
        }} />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SocketProvider>
    </AuthProvider>
  );
}
