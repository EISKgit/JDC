import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand">ILC</span>
      <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
        Dashboard
      </NavLink>
      <NavLink to="/updates" className={({ isActive }) => (isActive ? "active" : "")}>
        Updates
      </NavLink>
      <NavLink to="/onboarding" className={({ isActive }) => (isActive ? "active" : "")}>
        Life Profile
      </NavLink>
      <span className="navbar-spacer" />
      <span className="navbar-user">{user.email}</span>
      <button type="button" className="btn-link" onClick={handleLogout}>
        Log out
      </button>
    </nav>
  );
}
