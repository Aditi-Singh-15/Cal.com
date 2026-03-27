import { useEffect, useState } from "react";
import { cancelBooking, getBookings } from "../lib/api";
import { formatDateTime } from "../lib/time";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

export default function BookingsPage() {
  const [scope, setScope] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyBookingId, setBusyBookingId] = useState("");

  async function loadBookings(nextScope = scope) {
    try {
      setLoading(true);
      setError("");
      const data = await getBookings(nextScope);
      setBookings(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings(scope);
  }, [scope]);

  async function handleCancel(bookingId) {
    try {
      setBusyBookingId(bookingId);
      await cancelBooking(bookingId);
      await loadBookings(scope);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyBookingId("");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Bookings</h1>
          <p>See upcoming and past events booked through your event links.</p>
        </div>
      </header>

      <div className="tab-row">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`tab-button${tab.key === scope ? " active" : ""}`}
            onClick={() => setScope(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="panel">
        {loading ? <p className="muted">Loading bookings...</p> : null}

        {!loading && bookings.length === 0 ? (
          <div className="empty-state">
            <h3>No {scope} bookings</h3>
            <p>As soon as someone books with you, it will show up here.</p>
          </div>
        ) : null}

        {!loading &&
          bookings.map((booking) => (
            <article key={booking.id} className="booking-row">
              <div>
                <h3>{booking.eventTitle}</h3>
                <p className="muted">
                  {booking.bookerName} • {booking.bookerEmail}
                </p>
                <p>{formatDateTime(booking.startAt)}</p>
              </div>
              <div className="event-actions">
                <span className={`status-pill ${booking.status}`}>{booking.status}</span>
                {booking.status === "confirmed" && scope !== "past" ? (
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => handleCancel(booking.id)}
                    disabled={busyBookingId === booking.id}
                  >
                    {busyBookingId === booking.id ? "Cancelling..." : "Cancel"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}
