import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { cancelPublicBooking, getPublicBookingById, getPublicEvent } from "../lib/api";
import { formatDateTime } from "../lib/time";

export default function BookingConfirmationPage() {
  const { handle, slug, bookingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(location.state?.booking ?? null);
  const [eventType, setEventType] = useState(location.state?.eventType ?? null);
  const [loading, setLoading] = useState(!booking || !eventType);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function loadDetails() {
      if (booking && eventType) {
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [bookingData, eventData] = await Promise.all([
          booking ? Promise.resolve(booking) : getPublicBookingById(handle, slug, bookingId),
          eventType ? Promise.resolve(eventType) : getPublicEvent(handle, slug),
        ]);
        setBooking(bookingData);
        setEventType(eventData);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [booking, eventType, bookingId, handle, slug]);

  const hostInfo = booking?.host ?? (booking
    ? {
        name: booking.hostName ?? eventType?.host?.name,
        email: booking.hostEmail ?? eventType?.host?.email,
        timezone: booking.hostTimezone ?? eventType?.host?.timezone,
      }
    : eventType?.host ?? null);

  const whenLabel = useMemo(() => {
    if (!booking || !hostInfo) {
      return "";
    }
    return formatDateTime(booking.startAt, hostInfo.timezone);
  }, [booking, hostInfo]);

  async function handleCancel() {
    if (!booking) {
      return;
    }
    try {
      setCancelling(true);
      setError("");
      await cancelPublicBooking(handle, slug, booking.id);
      setNotice("Booking cancelled.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="public-page">
      <button type="button" className="back-link" onClick={() => navigate("/bookings")}>
        ← Back to bookings
      </button>

      <div className="public-card confirmation">
        <div className="confirmation-check">✓</div>
        <h1>This meeting is scheduled</h1>
        <p className="muted">
          We sent an email with a calendar invitation with the details to everyone.
        </p>
        {loading ? <p className="muted">Loading booking details...</p> : null}
        {error ? <div className="inline-error">{error}</div> : null}
        {notice ? <div className="inline-success">{notice}</div> : null}
        {!loading && !error && booking && eventType ? (
          <>
            <div className="confirmation-divider" />
            <div className="confirmation-rows">
              <div className="confirmation-row">
                <span className="confirmation-label">What</span>
                <span className="confirmation-value">
                  {eventType.title} between {hostInfo?.name ?? "Host"} and {booking.bookerName}
                </span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">When</span>
                <span className="confirmation-value">{whenLabel}</span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">Who</span>
                <span className="confirmation-value">
                  <div className="confirmation-person">
                    <span>{hostInfo?.name ?? "Host"}</span>
                    <span className="host-pill">Host</span>
                  </div>
                  <span className="muted">{hostInfo?.email ?? ""}</span>
                  <div className="confirmation-person">
                    <span>{booking.bookerName}</span>
                  </div>
                  <span className="muted">{booking.bookerEmail}</span>
                </span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">Where</span>
                <span className="confirmation-value">
                  Cal Video <span className="external-link">↗</span>
                </span>
              </div>
            </div>
            <div className="confirmation-divider" />
            <div className="confirmation-footer">
              <span>Need to make a change?</span>
              <button
                type="button"
                className="link-button"
              onClick={() => navigate(`/${handle}/${slug}?reschedule=true`)}
              >
                Reschedule
              </button>
              <span>or</span>
              <button
                type="button"
                className="link-button"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
