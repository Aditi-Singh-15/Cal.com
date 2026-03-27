import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getBookingById, getPublicEvent } from "../lib/api";
import { formatDateTime } from "../lib/time";

export default function BookingConfirmationPage() {
  const { slug, bookingId } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(location.state?.booking ?? null);
  const [eventType, setEventType] = useState(location.state?.eventType ?? null);
  const [loading, setLoading] = useState(!booking || !eventType);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDetails() {
      if (booking && eventType) {
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [bookingData, eventData] = await Promise.all([
          booking ? Promise.resolve(booking) : getBookingById(bookingId),
          eventType ? Promise.resolve(eventType) : getPublicEvent(slug),
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
  }, [booking, eventType, bookingId, slug]);

  return (
    <section className="public-page">
      <div className="public-card confirmation">
        <h1>Booking confirmed</h1>
        {loading ? <p className="muted">Loading booking details...</p> : null}
        {error ? <div className="inline-error">{error}</div> : null}
        {!loading && !error && booking && eventType ? (
          <div className="confirmation-details">
            <p>
              <strong>Event:</strong> {eventType.title}
            </p>
            <p>
              <strong>When:</strong> {formatDateTime(booking.startAt, eventType.host.timezone)}
            </p>
            <p>
              <strong>Booked by:</strong> {booking.bookerName} ({booking.bookerEmail})
            </p>
            <p>
              <strong>Status:</strong> {booking.status}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
