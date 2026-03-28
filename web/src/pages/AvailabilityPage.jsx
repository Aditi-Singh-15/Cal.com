import { useEffect, useMemo, useState } from "react";
import {
  createAvailabilitySchedule,
  deleteAvailabilitySchedule,
  getAvailability,
  updateAvailabilitySchedule,
} from "../lib/api";

const DAYS = [
  { key: 0, label: "Sunday" },
  { key: 1, label: "Monday" },
  { key: 2, label: "Tuesday" },
  { key: 3, label: "Wednesday" },
  { key: 4, label: "Thursday" },
  { key: 5, label: "Friday" },
  { key: 6, label: "Saturday" },
];

const TIMEZONES = ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York"];

const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 + 1 }, (_, index) => index * 15).filter(
  (minute) => minute <= 1440,
);
const START_TIME_OPTIONS = TIME_OPTIONS.filter((minute) => minute < 1440);

function makeSlot(startMinute = 540, endMinute = 1020) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return { id, startMinute, endMinute };
}

function formatMinuteLabel(minute) {
  if (minute >= 1440) {
    return "12:00 AM";
  }
  const hour24 = Math.floor(minute / 60);
  const mins = minute % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${mins.toString().padStart(2, "0")} ${period}`;
}

function buildEditorFromSchedule(schedule) {
  const days = DAYS.reduce((acc, day) => {
    acc[day.key] = { enabled: false, slots: [] };
    return acc;
  }, {});

  for (const rule of schedule.rules) {
    if (!days[rule.dayOfWeek]) {
      continue;
    }
    days[rule.dayOfWeek].enabled = true;
    days[rule.dayOfWeek].slots.push(makeSlot(rule.startMinute, rule.endMinute));
  }

  for (const day of DAYS) {
    days[day.key].slots.sort((a, b) => a.startMinute - b.startMinute);
  }

  return {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    isDefault: schedule.isDefault,
    days,
  };
}

function flattenRules(days) {
  return DAYS.flatMap((day) => {
    const entry = days[day.key];
    if (!entry.enabled) {
      return [];
    }
    return [...entry.slots]
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((slot) => ({
        dayOfWeek: day.key,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      }));
  });
}

function validateDaySlots(slots) {
  const sorted = [...slots].sort((a, b) => a.startMinute - b.startMinute);
  for (const slot of sorted) {
    if (slot.endMinute <= slot.startMinute) {
      return "End time must be later than start time.";
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      return "Slots for one day cannot overlap.";
    }
  }
  return "";
}

function getEndTimeOptions(startMinute) {
  return TIME_OPTIONS.filter((minute) => minute >= startMinute + 15 && minute <= 1440);
}

function buildScheduleSummary(days) {
  const activeDays = DAYS.filter((day) => days[day.key]?.enabled && days[day.key].slots.length > 0);
  if (activeDays.length === 0) {
    return "No active hours";
  }

  const allHaveSingleSlot = activeDays.every((day) => days[day.key].slots.length === 1);
  if (!allHaveSingleSlot) {
    return "Custom hours";
  }

  const firstSlot = days[activeDays[0].key].slots[0];
  const sameWindow = activeDays.every((day) => {
    const slot = days[day.key].slots[0];
    return slot.startMinute === firstSlot.startMinute && slot.endMinute === firstSlot.endMinute;
  });

  if (!sameWindow) {
    return "Custom hours";
  }

  const dayStart = activeDays[0].label.slice(0, 3);
  const dayEnd = activeDays[activeDays.length - 1].label.slice(0, 3);
  return `${dayStart} - ${dayEnd}, ${formatMinuteLabel(firstSlot.startMinute)} - ${formatMinuteLabel(firstSlot.endMinute)}`;
}

export default function AvailabilityPage() {
  const [schedules, setSchedules] = useState([]);
  const [editor, setEditor] = useState(null);
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("Working hours");
  const [editingName, setEditingName] = useState(false);
  const [copyModal, setCopyModal] = useState({ open: false, sourceDay: null, targets: [] });

  const copyCandidates = useMemo(() => {
    return DAYS.filter((day) => day.key !== copyModal.sourceDay);
  }, [copyModal.sourceDay]);
  const allCopyTargetsSelected =
    copyCandidates.length > 0 && copyModal.targets.length === copyCandidates.length;

  async function loadAvailability(scheduleId) {
    try {
      setLoading(true);
      setError("");
      const payload = await getAvailability(scheduleId);
      setSchedules(payload.schedules);
      if (payload.selectedSchedule) {
        setEditor(buildEditorFromSchedule(payload.selectedSchedule));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
  }, []);

  async function openEditor(scheduleId) {
    await loadAvailability(scheduleId);
    setView("edit");
    setNotice("");
    setEditingName(false);
  }

  async function handleCreateSchedule(event) {
    event.preventDefault();
    try {
      const created = await createAvailabilitySchedule(newScheduleName.trim());
      await loadAvailability(created.id);
      setShowCreateModal(false);
      setView("edit");
      setEditingName(true);
      setNotice("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function updateDay(dayKey, updater) {
    setEditor((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        days: {
          ...previous.days,
          [dayKey]: updater(previous.days[dayKey]),
        },
      };
    });
  }

  function toggleDay(dayKey, enabled) {
    updateDay(dayKey, (day) => {
      if (!enabled) {
        return { enabled: false, slots: [] };
      }
      return {
        enabled: true,
        slots: day.slots.length > 0 ? day.slots : [makeSlot()],
      };
    });
  }

  function updateSlot(dayKey, slotId, field, value) {
    updateDay(dayKey, (day) => ({
      ...day,
      slots: day.slots.map((slot) => {
        if (slot.id !== slotId) {
          return slot;
        }

        if (field === "startMinute") {
          const nextStart = value;
          const minEnd = Math.min(nextStart + 15, 1440);
          const nextEnd = slot.endMinute > nextStart ? slot.endMinute : minEnd;
          return {
            ...slot,
            startMinute: nextStart,
            endMinute: nextEnd,
          };
        }

        return { ...slot, [field]: value };
      }),
    }));
  }

  function addSlot(dayKey) {
    updateDay(dayKey, (day) => {
      const sorted = [...day.slots].sort((a, b) => a.startMinute - b.startMinute);
      const last = sorted[sorted.length - 1];
      if (!last) {
        return { ...day, slots: [makeSlot()] };
      }

      const startMinute = Math.min(last.endMinute, 1410);
      const endMinute = Math.min(startMinute + 60, 1440);
      return {
        ...day,
        slots: [...day.slots, makeSlot(startMinute, Math.max(endMinute, startMinute + 15))],
      };
    });
  }

  function deleteSlot(dayKey, slotId) {
    updateDay(dayKey, (day) => {
      const slots = day.slots.filter((slot) => slot.id !== slotId);
      return {
        enabled: slots.length > 0,
        slots,
      };
    });
  }

  function openCopyModal(dayKey) {
    setCopyModal({ open: true, sourceDay: dayKey, targets: [] });
  }

  function toggleCopyTarget(dayKey) {
    setCopyModal((previous) => {
      const has = previous.targets.includes(dayKey);
      return {
        ...previous,
        targets: has ? previous.targets.filter((value) => value !== dayKey) : [...previous.targets, dayKey],
      };
    });
  }

  function toggleCopyAllTargets() {
    setCopyModal((previous) => {
      const nextTargets =
        previous.targets.length === copyCandidates.length ? [] : copyCandidates.map((day) => day.key);
      return { ...previous, targets: nextTargets };
    });
  }

  function applyCopy() {
    if (!editor || copyModal.sourceDay === null) {
      setCopyModal({ open: false, sourceDay: null, targets: [] });
      return;
    }

    const sourceSlots = editor.days[copyModal.sourceDay].slots.map((slot) =>
      makeSlot(slot.startMinute, slot.endMinute),
    );
    setEditor((previous) => {
      if (!previous) {
        return previous;
      }

      const nextDays = { ...previous.days };
      for (const target of copyModal.targets) {
        nextDays[target] = {
          enabled: true,
          slots: sourceSlots.map((slot) => makeSlot(slot.startMinute, slot.endMinute)),
        };
      }

      return { ...previous, days: nextDays };
    });

    setCopyModal({ open: false, sourceDay: null, targets: [] });
  }

  async function handleSave() {
    if (!editor) {
      return;
    }

    const validationError = DAYS.map((day) => {
      const entry = editor.days[day.key];
      if (!entry.enabled) {
        return "";
      }
      return validateDaySlots(entry.slots);
    }).find(Boolean);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");
      const rules = flattenRules(editor.days);
      await updateAvailabilitySchedule(editor.id, {
        name: editor.name,
        timezone: editor.timezone,
        isDefault: editor.isDefault,
        rules,
      });
      await loadAvailability(editor.id);
      setNotice("Schedule saved");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchedule() {
    if (!editor) {
      return;
    }

    const confirmed = window.confirm("Delete this schedule?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteAvailabilitySchedule(editor.id);
      setView("list");
      setEditor(null);
      await loadAvailability();
      setNotice("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading && !editor && schedules.length === 0) {
    return (
      <section className="page">
        <p className="muted">Loading availability...</p>
      </section>
    );
  }

  if (view === "list") {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <h1>Availability</h1>
            <p>Configure times when you are available for bookings.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setShowCreateModal(true)}>
            + New
          </button>
        </header>

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="panel">
          {schedules.map((schedule) => (
            <article key={schedule.id} className="schedule-card">
              <div>
                <h3>
                  {schedule.name} {schedule.isDefault ? <span className="badge">Default</span> : null}
                </h3>
                <p className="muted">{schedule.summary}</p>
                <p className="muted">{schedule.timezone}</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => openEditor(schedule.id)}>
                Edit
              </button>
            </article>
          ))}
        </div>

        {showCreateModal ? (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Add a new schedule</h2>
              <form className="form-grid" onSubmit={handleCreateSchedule}>
                <label>
                  Name
                  <input
                    value={newScheduleName}
                    onChange={(event) => setNewScheduleName(event.target.value)}
                    required
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setShowCreateModal(false)}>
                    Close
                  </button>
                  <button type="submit" className="primary-button">
                    Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (!editor) {
    return null;
  }

  const scheduleSummary = buildScheduleSummary(editor.days);

  return (
    <section className="page">
      <header className="page-header">
        <div className="availability-header-main">
          <button
            className="back-icon-button"
            type="button"
            onClick={() => setView("list")}
            aria-label="Back to schedules"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </button>
          <div className="schedule-title-block">
            <div className="schedule-title-row">
              {editingName ? (
                <input
                  className="schedule-name-input"
                  value={editor.name}
                  onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                  onBlur={() => setEditingName(false)}
                  autoFocus
                />
              ) : (
                <h1>
                  {editor.name}{" "}
                  <button
                    className="title-icon-button"
                    type="button"
                    onClick={() => setEditingName(true)}
                    aria-label="Rename schedule"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5zM13.5 7l3.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </button>
                </h1>
              )}
            </div>
            <p className="schedule-subtitle">{scheduleSummary}</p>
          </div>
        </div>
        <div className="header-actions">
          <label className="default-toggle">
            <span>Set as default</span>
            <input
              type="checkbox"
              checked={editor.isDefault}
              onChange={(event) =>
                setEditor((previous) => ({ ...previous, isDefault: event.target.checked }))
              }
            />
          </label>
          <button type="button" className="ghost-button danger" onClick={handleDeleteSchedule}>
            Delete
          </button>
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}

      <div className="availability-layout">
        <div className="panel">
          {DAYS.map((day) => {
            const dayState = editor.days[day.key];
            return (
              <div key={day.key} className="day-section">
                <div className="day-header">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={dayState.enabled}
                      onChange={(event) => toggleDay(day.key, event.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                  <span className="day-label">{day.label}</span>
                </div>

                {dayState.enabled ? (
                  <div className="day-slots">
                    {dayState.slots.map((slot, index) => (
                      <div key={slot.id} className="slot-row">
                        <select
                          value={slot.startMinute}
                          onChange={(event) =>
                            updateSlot(day.key, slot.id, "startMinute", Number(event.target.value))
                          }
                        >
                          {START_TIME_OPTIONS.map((minute) => (
                            <option key={minute} value={minute}>
                              {formatMinuteLabel(minute)}
                            </option>
                          ))}
                        </select>
                        <span className="muted">-</span>
                        <select
                          value={slot.endMinute}
                          onChange={(event) =>
                            updateSlot(day.key, slot.id, "endMinute", Number(event.target.value))
                          }
                        >
                          {getEndTimeOptions(slot.startMinute).map((minute) => (
                            <option key={minute} value={minute}>
                              {formatMinuteLabel(minute)}
                            </option>
                          ))}
                        </select>
                        {index === 0 ? (
                          <>
                            <button className="icon-button" type="button" onClick={() => addSlot(day.key)}>
                              +
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => openCopyModal(day.key)}
                            >
                              Copy
                            </button>
                          </>
                        ) : null}
                        {dayState.slots.length > 1 ? (
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => deleteSlot(day.key, slot.id)}
                          >
                            Del
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="panel">
          <label>
            Timezone
            <select
              value={editor.timezone}
              onChange={(event) => setEditor((previous) => ({ ...previous, timezone: event.target.value }))}
            >
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {copyModal.open ? (
        <div className="modal-overlay">
          <div className="modal copy-modal">
            <h2>Copy times to</h2>
            <div className="copy-options">
              <label className="copy-option">
                <input type="checkbox" checked={allCopyTargetsSelected} onChange={toggleCopyAllTargets} />
                <span>Select all</span>
              </label>
              {copyCandidates.map((day) => (
                <label key={day.key} className="copy-option">
                  <input
                    type="checkbox"
                    checked={copyModal.targets.includes(day.key)}
                    onChange={() => toggleCopyTarget(day.key)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setCopyModal({ open: false, sourceDay: null, targets: [] })}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={applyCopy}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
