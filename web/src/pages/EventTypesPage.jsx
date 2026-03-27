import { useEffect, useMemo, useState } from "react";
import {
  createEventType,
  deleteEventType,
  getEventTypes,
  setEventTypeActive,
  updateEventType,
} from "../lib/api";

const INITIAL_FORM = {
  title: "",
  slug: "",
  description: "",
  durationMinutes: "30",
};

export default function EventTypesPage() {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  async function loadEventTypes() {
    try {
      setLoading(true);
      setError("");
      const data = await getEventTypes();
      setEventTypes(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEventTypes();
  }, []);

  const filteredEventTypes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return eventTypes;
    }

    return eventTypes.filter((item) => {
      return item.title.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term);
    });
  }, [eventTypes, search]);

  function openCreateModal() {
    setMode("create");
    setEditingId(null);
    setActionError("");
    setForm(INITIAL_FORM);
  }

  function openEditModal(eventType) {
    setMode("edit");
    setEditingId(eventType.id);
    setActionError("");
    setForm({
      title: eventType.title,
      slug: eventType.slug,
      description: eventType.description ?? "",
      durationMinutes: String(eventType.durationMinutes),
    });
  }

  function closeModal() {
    setMode(null);
    setEditingId(null);
    setActionError("");
    setForm(INITIAL_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim().toLowerCase(),
      description: form.description.trim(),
      durationMinutes: Number(form.durationMinutes),
    };

    if (!payload.title || !payload.slug || Number.isNaN(payload.durationMinutes)) {
      setActionError("Please fill all required fields");
      return;
    }

    try {
      setSaving(true);
      setActionError("");
      if (mode === "create") {
        await createEventType(payload);
      } else if (mode === "edit" && editingId) {
        await updateEventType(editingId, payload);
      }

      closeModal();
      await loadEventTypes();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(eventType) {
    try {
      await setEventTypeActive(eventType.id, !eventType.isActive);
      await loadEventTypes();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDelete(eventTypeId) {
    const isConfirmed = window.confirm("Delete this event type?");
    if (!isConfirmed) {
      return;
    }

    try {
      await deleteEventType(eventTypeId);
      await loadEventTypes();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleCopyLink(slug) {
    const link = `${window.location.origin}/book/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setError("Unable to copy link to clipboard");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Event types</h1>
          <p>Configure event links people can book on your calendar.</p>
        </div>
        <div className="header-actions">
          <input
            className="search-input"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="primary-button" onClick={openCreateModal} type="button">
            + New
          </button>
        </div>
      </header>

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="panel">
        {loading ? <p className="muted">Loading event types...</p> : null}
        {!loading && filteredEventTypes.length === 0 ? (
          <div className="empty-state">
            <h3>No event types found</h3>
            <p>Create your first event type to start sharing booking links.</p>
          </div>
        ) : null}

        {!loading &&
          filteredEventTypes.map((item) => (
            <article key={item.id} className="event-row">
              <div>
                <h3>{item.title}</h3>
                <p className="muted">/book/{item.slug}</p>
                <span className="badge">{item.durationMinutes}m</span>
              </div>
              <div className="event-actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={item.isActive}
                    onChange={() => handleToggle(item)}
                  />
                  <span className="slider" />
                </label>
                <button type="button" className="ghost-button" onClick={() => openEditModal(item)}>
                  Edit
                </button>
                <button type="button" className="ghost-button" onClick={() => handleCopyLink(item.slug)}>
                  Copy link
                </button>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={() => handleDelete(item.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
      </div>

      {mode ? (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{mode === "create" ? "Add a new event type" : "Edit event type"}</h2>
            <p className="muted">Only deterministic fields from backend are supported.</p>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))}
                  required
                />
              </label>
              <label>
                URL slug
                <input
                  value={form.slug}
                  onChange={(event) => setForm((old) => ({ ...old, slug: event.target.value }))}
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))}
                  rows={4}
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={form.durationMinutes}
                  onChange={(event) =>
                    setForm((old) => ({ ...old, durationMinutes: event.target.value }))
                  }
                  required
                />
              </label>

              {actionError ? <div className="inline-error">{actionError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeModal} disabled={saving}>
                  Close
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
