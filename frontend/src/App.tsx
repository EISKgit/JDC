import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/Feedback";
import { NavBar } from "./components/NavBar";
import { PageSkeleton } from "./components/PageSkeleton";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RouteFocus } from "./components/RouteFocus";
import { useAuth } from "./context/auth";

// Each page is its own download, fetched the first time it's visited, so the first
// screen doesn't wait for the code of every other page.
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const Ask = lazy(() => import("./pages/Ask").then((m) => ({ default: m.Ask })));
const AuthCallback = lazy(() => import("./pages/AuthCallback").then((m) => ({ default: m.AuthCallback })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Goals = lazy(() => import("./pages/Goals").then((m) => ({ default: m.Goals })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const ForgotPassword = lazy(() => import("./pages/PasswordReset").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("./pages/PasswordReset").then((m) => ({ default: m.ResetPassword })));
const Signup = lazy(() => import("./pages/Signup").then((m) => ({ default: m.Signup })));
const Updates = lazy(() => import("./pages/Updates").then((m) => ({ default: m.Updates })));

function App() {
  const { user } = useAuth();

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <RouteFocus />
      <main id="main" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
              <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route
                path="/goals"
                element={
                  <ProtectedRoute>
                    <Goals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <Account />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/updates"
                element={
                  <ProtectedRoute>
                    <Updates />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/ask"
                element={
                  <ProtectedRoute>
                    <Ask />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
}

export default App;
