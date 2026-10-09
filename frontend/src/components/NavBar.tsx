import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/updates", label: "Updates", icon: "✍️" },
  { to: "/onboarding", label: "Life Profile", icon: "🧭" },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const displayName = user.full_name || user.email;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/dashboard" className="navbar-brand" aria-label="JDC home">
          <Logo size={28} />
          <span>JDC</span>
        </NavLink>
        <div className="navbar-links">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <span aria-hidden="true">{link.icon}</span>
              <span className="navbar-link-label">{link.label}</span>
            </NavLink>
          ))}
        </div>
        <span className="navbar-spacer" />
        <span className="navbar-user" title={user.email}>
          <span className="avatar" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="navbar-user-name">{displayName}</span>
        </span>
        <button type="button" className="btn-secondary btn-small" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
