import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuthMe, logout } from "../lib/api";

const NAV_ITEMS = [
  {
    to: "/event-types",
    label: "Event types",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.5 7.5h3a4 4 0 0 1 0 8h-3" />
        <path d="M13.5 16.5h-3a4 4 0 0 1 0-8h3" />
      </svg>
    ),
  },
  {
    to: "/bookings",
    label: "Bookings",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
        <path d="M7 3.5v4" />
        <path d="M17 3.5v4" />
        <path d="M3.5 9.5h17" />
      </svg>
    ),
  },
  {
    to: "/availability",
    label: "Availability",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.5l3 1.75" />
      </svg>
    ),
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadUser() {
      try {
        const me = await getAuthMe();
        if (isMounted) {
          setUser(me);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      }
    }

    loadUser();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const initials = user?.name?.trim()?.[0]?.toUpperCase() ?? "A";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-profile">
          <div className="avatar">
            {initials}
            <span className="status-dot" />
          </div>
          <div className="profile-meta">
            <p className="profile-name">{user?.name ?? "Host"}</p>
            <span className="profile-caret" aria-hidden="true">
              ▾
            </span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="logout-link" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
