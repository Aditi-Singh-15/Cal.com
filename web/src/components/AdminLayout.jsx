import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/event-types", label: "Event types" },
  { to: "/bookings", label: "Bookings" },
  { to: "/availability", label: "Availability" },
];

export default function AdminLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-profile">
          <div className="avatar">A</div>
          <div>
            <p className="profile-name">Aditi Singh</p>
            <p className="profile-subtitle">Cal Clone</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
