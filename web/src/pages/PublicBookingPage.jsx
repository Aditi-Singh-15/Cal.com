import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPublicBooking, getPublicEvent, getPublicSlots } from "../lib/api";
import { formatTime, nextDateString } from "../lib/time";

export default function PublicBookingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [eventType, setEventType] = useState(null);
  const [timezone, setTimezone] = useState("");
  const [date, setDate] = useState(nextDateString());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setError("");
        const event = await getPublicEvent(slug);
        setEventType(event);
        setTimezone(event.host.timezone);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoadingEvent(false);
      }
    }

    loadEvent();
  }, [slug]);

  useEffect(() => {
    async function loadSlots() {
      if (!eventType || !timezone || !date) {
        return;
      }

      try {
        setLoadingSlots(true);
        setError("");
        const response = await getPublicSlots(slug, date, timezone);
        setSlots(response.slots);
      } catch (requestError) {
        setError(requestError.message);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [slug, eventType, timezone, date]);

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) {
      return "";
    }
    return formatTime(selectedSlot.startAt, timezone);
  }, [selectedSlot, timezone]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedSlot) {
      setError("Select a time slot first.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const booking = await createPublicBooking(slug, {
        name: name.trim(),
        email: email.trim(),
        startAt: selectedSlot.startAt,
        timezone,
      });
      navigate(`/book/${slug}/confirmation/${booking.id}`, {
        state: { booking, eventType },
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingEvent) {
    return (
      <section className="public-page">
        <div className="public-card">
          <p className="muted">Loading event...</p>
        </div>
      </section>
    );
  }

  if (!eventType) {
    return (
      <section className="public-page">
        <div className="public-card">
          <h2>Event not found</h2>
          <p className="muted">This booking link is unavailable.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="public-page">
      <div className="public-grid">
        <div className="public-card">
          <h1>{eventType.title}</h1>
          <p className="muted">{eventType.description || "Book a time slot."}</p>
          <p className="muted">
            Duration: {eventType.durationMinutes}m • Timezone: {eventType.host.timezone}
          </p>

          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Timezone
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </label>
        </div>

        <div className="public-card">
          <h2>Available slots</h2>
          {loadingSlots ? <p className="muted">Loading slots...</p> : null}
          {!loadingSlots && slots.length === 0 ? (
            <p className="muted">No available slots for this date.</p>
          ) : null}
          <div className="slot-list">
            {slots.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                className={`slot-button${selectedSlot?.startAt === slot.startAt ? " active" : ""}`}
                onClick={() => setSelectedSlot(slot)}
              >
                {formatTime(slot.startAt, timezone)}
              </button>
            ))}
          </div>
        </div>

        <div className="public-card">
          <h2>Your details</h2>
          <p className="muted">{selectedSlot ? `Selected: ${selectedSlotLabel}` : "Select a slot first."}</p>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            {error ? <div className="inline-error">{error}</div> : null}

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Booking..." : "Confirm booking"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
