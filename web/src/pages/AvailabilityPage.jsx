import { useEffect, useState } from "react";
import { getAvailability, updateAvailability } from "../lib/api";
import { minutesToTimeInput, timeInputToMinutes } from "../lib/time";

const DAYS = [
  { key: 0, label: "Sunday" },
  { key: 1, label: "Monday" },
  { key: 2, label: "Tuesday" },
  { key: 3, label: "Wednesday" },
  { key: 4, label: "Thursday" },
  { key: 5, label: "Friday" },
  { key: 6, label: "Saturday" },
];

const TIMEZONE_OPTIONS = ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York"];

function createDefaultDayState() {
  return DAYS.reduce((accumulator, day) => {
    accumulator[day.key] = {
      enabled: false,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    };
    return accumulator;
  }, {});
}

export default function AvailabilityPage() {
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [days, setDays] = useState(createDefaultDayState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAvailability() {
    try {
      setLoading(true);
      setError("");
      const data = await getAvailability();
      const nextDays = createDefaultDayState();
      for (const rule of data.rules) {
        nextDays[rule.dayOfWeek] = {
          enabled: true,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        };
      }
      setTimezone(data.timezone);
      setDays(nextDays);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
  }, []);

  async function handleSave() {
    const rules = DAYS.filter((day) => days[day.key].enabled).map((day) => ({
      dayOfWeek: day.key,
      startMinute: days[day.key].startMinute,
      endMinute: days[day.key].endMinute,
    }));

    const hasInvalidRange = rules.some((rule) => rule.endMinute <= rule.startMinute);
    if (hasInvalidRange) {
      setError("Each enabled day must have end time later than start time.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");
      await updateAvailability({ timezone, rules });
      setNotice("Availability saved");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function setDayEnabled(dayKey, enabled) {
    setDays((previous) => ({
      ...previous,
      [dayKey]: {
        ...previous[dayKey],
        enabled,
      },
    }));
  }

  function setDayTime(dayKey, field, value) {
    setDays((previous) => ({
      ...previous,
      [dayKey]: {
        ...previous[dayKey],
        [field]: timeInputToMinutes(value),
      },
    }));
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Working hours</h1>
          <p>Set the times when people can book with you.</p>
        </div>
        <button className="primary-button" type="button" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save"}
        </button>
      </header>

      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}

      <div className="availability-layout">
        <div className="panel">
          {loading ? <p className="muted">Loading availability...</p> : null}
          {!loading &&
            DAYS.map((day) => (
              <div className="availability-row" key={day.key}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={days[day.key].enabled}
                    onChange={(event) => setDayEnabled(day.key, event.target.checked)}
                  />
                  <span className="slider" />
                </label>
                <span className="day-label">{day.label}</span>
                <input
                  type="time"
                  value={minutesToTimeInput(days[day.key].startMinute)}
                  disabled={!days[day.key].enabled}
                  onChange={(event) => setDayTime(day.key, "startMinute", event.target.value)}
                />
                <span className="muted">-</span>
                <input
                  type="time"
                  value={minutesToTimeInput(days[day.key].endMinute)}
                  disabled={!days[day.key].enabled}
                  onChange={(event) => setDayTime(day.key, "endMinute", event.target.value)}
                />
              </div>
            ))}
        </div>

        <div className="panel">
          <label>
            Timezone
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
