import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createPublicBooking,
  getPublicCalendar,
  getPublicEvent,
  getPublicSlots,
} from "../lib/api";
import { nextDateString } from "../lib/time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(value) {
  return value.toString().padStart(2, "0");
}

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonthIndex = monthNumber - 1 + delta;
  const nextDate = new Date(year, nextMonthIndex, 1);
  return `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}`;
}

function getMonthMeta(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return {
    year,
    monthNumber,
    startDay: firstDay.getDay(),
    daysInMonth,
  };
}

function formatMonthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export default function PublicBookingPage() {
  const { handle, slug } = useParams();
  const navigate = useNavigate();

  const [eventType, setEventType] = useState(null);
  const [timezone, setTimezone] = useState("");
  const [date, setDate] = useState(nextDateString());
  const [calendarMonth, setCalendarMonth] = useState(nextDateString().slice(0, 7));
  const [availableDates, setAvailableDates] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [hour12, setHour12] = useState(true);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvent() {
      try {
        setLoadingEvent(true);
        setError("");
        const event = await getPublicEvent(handle, slug);
        setEventType(event);
        setTimezone(event.host.timezone);
        setCalendarMonth(nextDateString().slice(0, 7));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoadingEvent(false);
      }
    }

    loadEvent();
  }, [handle, slug]);

  useEffect(() => {
    async function loadCalendar() {
      if (!eventType || !timezone || !calendarMonth) {
        return;
      }

      try {
        setLoadingCalendar(true);
        setError("");
        const response = await getPublicCalendar(handle, slug, calendarMonth, timezone);
        const dates = response.dates ?? [];
        setAvailableDates(dates);

        const today = getTodayString();
        const availableFutureDates = dates.filter((value) => value > today);
        const isSameMonth = date && date.slice(0, 7) === calendarMonth;
        if (!isSameMonth || !availableFutureDates.includes(date)) {
          setDate(availableFutureDates[0] ?? "");
          setSelectedSlot(null);
        }
      } catch (requestError) {
        setError(requestError.message);
        setAvailableDates([]);
        setDate("");
        setSelectedSlot(null);
      } finally {
        setLoadingCalendar(false);
      }
    }

    loadCalendar();
  }, [handle, slug, eventType, timezone, calendarMonth]);

  useEffect(() => {
    async function loadSlots() {
      if (!eventType || !timezone || !date) {
        setSlots([]);
        return;
      }

      try {
        setLoadingSlots(true);
        setError("");
        const response = await getPublicSlots(handle, slug, date, timezone);
        setSlots(response.slots);
      } catch (requestError) {
        setError(requestError.message);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [handle, slug, eventType, timezone, date]);

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12,
      timeZone: timezone,
    });
    return formatter.format(new Date(selectedSlot.startAt));
  }, [selectedSlot, timezone, hour12]);

  const selectedSlotRangeLabel = useMemo(() => {
    if (!selectedSlot) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12,
      timeZone: timezone,
    });
    const start = formatter.format(new Date(selectedSlot.startAt));
    const end = formatter.format(new Date(selectedSlot.endAt));
    return `${start} - ${end}`;
  }, [selectedSlot, timezone, hour12]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedSlot) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    });
    return formatter.format(new Date(selectedSlot.startAt));
  }, [selectedSlot, timezone]);

  const availableDatesSet = useMemo(() => new Set(availableDates), [availableDates]);
  const todayString = useMemo(() => getTodayString(), []);
  const isConfirmStep = Boolean(selectedSlot);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedSlot) {
      setError("Select a time slot first.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const booking = await createPublicBooking(handle, slug, {
        name: name.trim(),
        email: email.trim(),
        startAt: selectedSlot.startAt,
        timezone,
      });
      navigate(`/${handle}/${slug}/confirmation/${booking.id}`, {
        state: { booking, eventType },
      });
    } catch (requestError) {
      if (requestError.code === "HOST_BOOKING_NOT_ALLOWED") {
        setError("You cannot book your own event type.");
      } else {
        setError(requestError.message);
      }
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
      <div className={`public-grid${isConfirmStep ? " two-column" : ""}`}>
        <div className="public-card">
          <h1>{eventType.title}</h1>
          <p className="muted">{eventType.description || "Book a time slot."}</p>
          <p className="muted">
            Duration: {eventType.durationMinutes}m - Timezone: {eventType.host.timezone}
          </p>
          {selectedSlot ? (
            <p className="muted">
              {selectedDateLabel} {selectedSlotRangeLabel}
            </p>
          ) : (
            <p className="muted">Select a date to view available slots.</p>
          )}
        </div>

        {isConfirmStep ? (
          <div className="public-card">
            <h2>Your details</h2>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                Your name *
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                Email address *
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Additional notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Please share anything that will help prepare for our meeting."
                />
              </label>

              {error ? <div className="inline-error">{error}</div> : null}

              <div className="slot-form-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setSelectedSlot(null)}
                  disabled={submitting}
                >
                  Back
                </button>
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "Booking..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="public-card slots-card">
              <div className="calendar-header">
                <button
                  type="button"
                  className="calendar-nav"
                  onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}
                  disabled={calendarMonth <= todayString.slice(0, 7)}
                >
                  ‹
                </button>
                <h2>{formatMonthLabel(calendarMonth)}</h2>
                <button
                  type="button"
                  className="calendar-nav"
                  onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}
                >
                  ›
                </button>
              </div>
              <div className="calendar-weekdays">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {Array.from({ length: getMonthMeta(calendarMonth).startDay }).map((_, index) => (
                  <span key={`blank-${index}`} className="calendar-cell empty" />
                ))}
                {Array.from({ length: getMonthMeta(calendarMonth).daysInMonth }).map((_, index) => {
                  const dayNumber = index + 1;
                  const dateValue = `${calendarMonth}-${pad2(dayNumber)}`;
                  const isFuture = dateValue > todayString;
                  const isAvailable = availableDatesSet.has(dateValue) && isFuture;
                  const isSelected = dateValue === date;
                  return (
                    <button
                      key={dateValue}
                      type="button"
                      className={`calendar-cell${isSelected ? " selected" : ""}${
                        !isAvailable ? " disabled" : ""
                      }`}
                      onClick={() => {
                        if (!isAvailable) {
                          return;
                        }
                        setDate(dateValue);
                        setSelectedSlot(null);
                      }}
                      disabled={!isAvailable}
                    >
                      {dayNumber}
                    </button>
                  );
                })}
              </div>
              {loadingCalendar ? <p className="muted">Loading availability...</p> : null}
              {!loadingCalendar && availableDates.length === 0 ? (
                <p className="muted">No available dates this month.</p>
              ) : null}
            </div>

            <div className="public-card">
          <div className="slots-header">
            <h2>Available slots</h2>
            <div className="time-toggle">
              <button
                    type="button"
                    className={`time-toggle-button${hour12 ? " active" : ""}`}
                    onClick={() => setHour12(true)}
                  >
                    12h
                  </button>
                  <button
                    type="button"
                    className={`time-toggle-button${!hour12 ? " active" : ""}`}
                    onClick={() => setHour12(false)}
                  >
                    24h
                  </button>
                </div>
              </div>
          {loadingSlots ? <p className="muted">Loading slots...</p> : null}
          {!loadingSlots && date && slots.length === 0 ? (
            <p className="muted">No available slots for this date.</p>
          ) : null}
          {!date ? <p className="muted">Select an available date first.</p> : null}
          <div className="slot-list-scroll">
            <div className="slot-list">
              {slots.map((slot) => {
                const formatted = new Intl.DateTimeFormat(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12,
                  timeZone: timezone,
                }).format(new Date(slot.startAt));
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    className={`slot-button${
                      selectedSlot?.startAt === slot.startAt ? " active" : ""
                    }`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatted}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </>
        )}
      </div>
    </section>
  );
}
