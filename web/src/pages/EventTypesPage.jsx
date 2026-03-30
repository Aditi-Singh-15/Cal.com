import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEventType,
  deleteEventType,
  getAuthMe,
  getEventTypes,
  setEventTypeActive,
  updateEventType,
} from "../lib/api";

const INITIAL_FORM = {
  title: "",
  description: "",
  durationMinutes: "30",
};
const URL_PREFIX = "https://cal.com/";
const PUBLIC_PATH_PREFIX = "/";
const ALLOWED_DESCRIPTION_TAGS = new Set(["B", "STRONG", "I", "EM", "BR", "P", "DIV"]);

function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function sanitizeDescriptionHtml(value) {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) {
    return "";
  }

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) {
    return "";
  }

  function sanitizeChildren(element) {
    const children = Array.from(element.childNodes);
    children.forEach((child) => {
      if (child.nodeType === 1) {
        const childElement = child;
        if (!ALLOWED_DESCRIPTION_TAGS.has(childElement.tagName)) {
          const textNode = doc.createTextNode(childElement.textContent ?? "");
          childElement.replaceWith(textNode);
          return;
        }

        while (childElement.attributes.length > 0) {
          childElement.removeAttribute(childElement.attributes[0].name);
        }
        sanitizeChildren(childElement);
      } else if (child.nodeType === 8) {
        child.remove();
      }
    });
  }

  sanitizeChildren(root);
  return root.innerHTML.trim();
}

function hasDescriptionText(html) {
  const source = typeof html === "string" ? html : "";
  return source.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

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
  const [isDescriptionEmpty, setIsDescriptionEmpty] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [hostHandle, setHostHandle] = useState("");
  const descriptionEditorRef = useRef(null);

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

  useEffect(() => {
    async function loadHandle() {
      try {
        const me = await getAuthMe();
        setHostHandle(me.handle ?? "");
      } catch {
        setHostHandle("");
      }
    }

    loadHandle();
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
    setIsDescriptionEmpty(true);
  }

  function openEditModal(eventType) {
    const safeDescription = sanitizeDescriptionHtml(eventType.description ?? "");
    setMode("edit");
    setEditingId(eventType.id);
    setActionError("");
    setForm({
      title: eventType.title,
      description: safeDescription,
      durationMinutes: String(eventType.durationMinutes),
    });
    setIsDescriptionEmpty(!hasDescriptionText(safeDescription));
  }

  function closeModal() {
    setMode(null);
    setEditingId(null);
    setActionError("");
    setForm(INITIAL_FORM);
    setIsDescriptionEmpty(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const generatedSlug = toSlug(form.title);

    const payload = {
      title: form.title.trim(),
      slug: generatedSlug,
      description: sanitizeDescriptionHtml(form.description),
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
      if (requestError.code === "BAD_REQUEST") {
        setActionError(`BAD_REQUEST: ${requestError.message}`);
      } else {
        setActionError(requestError.message);
      }
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

  async function confirmDeleteEventType() {
    if (!deleteTarget) {
      return;
    }
    try {
      setDeleting(true);
      setError("");
      await deleteEventType(deleteTarget.id);
      setDeleteTarget(null);
      await loadEventTypes();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopyLink(slug) {
    const link = `${window.location.origin}${PUBLIC_PATH_PREFIX}${hostHandle}/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setError("Unable to copy link to clipboard");
    }
  }

  function handleOpenBooking(slug) {
    const link = `${window.location.origin}${PUBLIC_PATH_PREFIX}${hostHandle}/${slug}`;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function handleDescriptionInput(event) {
    const nextValue = event.currentTarget.innerHTML;
    setForm((old) => ({ ...old, description: nextValue }));
    setIsDescriptionEmpty(!hasDescriptionText(nextValue));
  }

  function handleDescriptionPaste(event) {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, pastedText);
  }

  function applyDescriptionStyle(command) {
    const editor = descriptionEditorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    document.execCommand(command, false);
    const nextValue = editor.innerHTML;
    setForm((old) => ({ ...old, description: nextValue }));
    setIsDescriptionEmpty(!hasDescriptionText(nextValue));
  }

  useEffect(() => {
    if (!mode) {
      return;
    }

    const editor = descriptionEditorRef.current;
    if (!editor) {
      return;
    }

    const safeDescription = sanitizeDescriptionHtml(form.description);
    editor.innerHTML = safeDescription;
    setIsDescriptionEmpty(!hasDescriptionText(safeDescription));
  }, [mode, editingId]);

  useEffect(() => {
    if (!menuOpenId) {
      return;
    }

    function handleCloseMenu(event) {
      if (!event.target.closest(".event-actions-menu")) {
        setMenuOpenId(null);
      }
    }

    document.addEventListener("click", handleCloseMenu);
    return () => document.removeEventListener("click", handleCloseMenu);
  }, [menuOpenId]);

  const generatedSlug = useMemo(() => toSlug(form.title), [form.title]);
  const urlPreview = hostHandle
    ? `${URL_PREFIX}${hostHandle}/${generatedSlug}`
    : `${URL_PREFIX}${generatedSlug}`;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Event types</h1>
          <p>Configure different events for people to book on your calendar.</p>
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
                <p className="muted">
                  {PUBLIC_PATH_PREFIX}
                  {item.hostHandle ?? hostHandle}/{item.slug}
                </p>
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
                <div className="event-actions-menu">
                  <button
                    type="button"
                    className="event-action-button"
                    onClick={() => handleOpenBooking(item.slug)}
                    aria-label="Open booking page"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M7 7h6a1 1 0 0 0 0-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a1 1 0 1 0-2 0v6H7V7Z"
                        fill="currentColor"
                      />
                      <path
                        d="M14 5h5v5a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-6a1 1 0 1 0 0 2Z"
                        fill="currentColor"
                      />
                      <path
                        d="M20.707 3.293a1 1 0 0 0-1.414 0L11 11.586a1 1 0 0 0 1.414 1.414L20.707 4.707a1 1 0 0 0 0-1.414Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="event-action-button"
                    onClick={() => handleCopyLink(item.slug)}
                    aria-label="Copy booking link"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M9 9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V9Z"
                        fill="currentColor"
                      />
                      <path
                        d="M7 5a2 2 0 0 1 2-2h6a1 1 0 1 1 0 2H9v10a1 1 0 1 1-2 0V5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <div className="event-action-menu-wrapper">
                    <button
                      type="button"
                      className="event-action-button"
                      onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                      aria-label="More actions"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="6" cy="12" r="2" fill="currentColor" />
                        <circle cx="12" cy="12" r="2" fill="currentColor" />
                        <circle cx="18" cy="12" r="2" fill="currentColor" />
                      </svg>
                    </button>
                    {menuOpenId === item.id ? (
                      <div className="event-action-dropdown">
                        <button
                          type="button"
                          className="event-action-item"
                          onClick={() => {
                            setMenuOpenId(null);
                            openEditModal(item);
                          }}
                        >
                          Edit event
                        </button>
                        <button
                          type="button"
                          className="event-action-item danger"
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteTarget(item);
                          }}
                        >
                          Delete event
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
      </div>

      {mode ? (
        <div className="modal-overlay">
          <div className="modal event-type-modal">
            <div className="event-type-modal-body">
              <h2>{mode === "create" ? "Add a new event type" : "Edit event type"}</h2>
              <p className="muted">Set up event types to offer different types of meetings.</p>

              <form className="form-grid event-type-form" onSubmit={handleSubmit}>
                <label>
                  Title
                  <input
                    value={form.title}
                    onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  URL
                  <input value={generatedSlug ? urlPreview : URL_PREFIX} readOnly />
                </label>

                <label>
                  Description
                  <div className="description-editor-wrapper">
                    <div className="description-toolbar">
                      <button
                        type="button"
                        className="description-tool"
                        aria-label="Bold"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDescriptionStyle("bold")}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        className="description-tool italic"
                        aria-label="Italic"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDescriptionStyle("italic")}
                      >
                        I
                      </button>
                    </div>

                    <div
                      ref={descriptionEditorRef}
                      className="description-editor"
                      contentEditable
                      role="textbox"
                      aria-multiline="true"
                      data-placeholder="A quick video meeting."
                      data-empty={isDescriptionEmpty ? "true" : "false"}
                      suppressContentEditableWarning
                      onInput={handleDescriptionInput}
                      onPaste={handleDescriptionPaste}
                    />
                  </div>
                </label>

                <label>
                  Duration
                  <div className="duration-field">
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
                    <span className="duration-suffix">minutes</span>
                  </div>
                </label>

                <div className="event-modal-actions">
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
        </div>
      ) : null}

      {actionError ? (
        <div className="event-error-toast" role="alert">
          <p>{actionError}</p>
          <button
            type="button"
            className="event-error-toast-close"
            onClick={() => setActionError("")}
            disabled={saving}
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay">
          <div className="modal delete-event-modal">
            <div className="delete-event-header">
              <span className="delete-event-icon">!</span>
              <h3>Delete event type?</h3>
            </div>
            <p className="muted">
              Anyone who you've shared this link with will no longer be able to book using it.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button delete-event-confirm"
                onClick={confirmDeleteEventType}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete event type"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
