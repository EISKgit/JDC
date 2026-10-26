import { LayoutDashboard, LogOut, MessageCircleQuestion, NotebookPen, Target, UserRound } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/updates", label: "Updates", Icon: NotebookPen },
  { to: "/goals", label: "Goals", Icon: Target },
  { to: "/ask", label: "Ask JDC", Icon: MessageCircleQuestion },
  { to: "/onboarding", label: "Life Profile", Icon: UserRound },
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
          {LINKS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon size={17} aria-hidden="true" />
              <span className="navbar-link-label">{label}</span>
            </NavLink>
          ))}
        </div>
        <span className="navbar-spacer" />
        <ThemeToggle />
        <Link to="/account" className="navbar-user" title={`${user.email} - account settings`}>
          {user.profile_picture_url ? (
            <img src={user.profile_picture_url} alt="" className="avatar" />
          ) : (
            <span className="avatar" aria-hidden="true">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="navbar-user-name">{displayName}</span>
        </Link>
        <button type="button" className="btn-secondary btn-small navbar-logout" onClick={handleLogout}>
          <LogOut size={14} aria-hidden="true" />
          <span className="navbar-logout-label">Log out</span>
        </button>
      </div>
    </nav>
  );
}
