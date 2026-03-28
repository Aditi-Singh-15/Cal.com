const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.code ?? `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = payload?.code ?? "REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function getEventTypes() {
  return request("/api/event-types");
}

export async function createEventType(input) {
  return request("/api/event-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEventType(id, input) {
  return request(`/api/event-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEventType(id) {
  return request(`/api/event-types/${id}`, {
    method: "DELETE",
  });
}

export async function setEventTypeActive(id, isActive) {
  return request(`/api/event-types/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function getAvailability(scheduleId) {
  const query = scheduleId ? `?scheduleId=${encodeURIComponent(scheduleId)}` : "";
  return request(`/api/availability${query}`);
}

export async function createAvailabilitySchedule(name) {
  return request("/api/availability/schedules", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateAvailabilitySchedule(scheduleId, input) {
  return request(`/api/availability/schedules/${scheduleId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteAvailabilitySchedule(scheduleId) {
  return request(`/api/availability/schedules/${scheduleId}`, {
    method: "DELETE",
  });
}

export async function getBookings(scope) {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return request(`/api/bookings${query}`);
}

export async function getBookingById(id) {
  return request(`/api/bookings/${id}`);
}

export async function cancelBooking(id) {
  return request(`/api/bookings/${id}/cancel`, {
    method: "POST",
  });
}

export async function getPublicEvent(slug) {
  return request(`/api/public/${slug}`);
}

export async function getPublicSlots(slug, date, timezone) {
  const query = new URLSearchParams({ date, tz: timezone });
  return request(`/api/public/${slug}/slots?${query.toString()}`);
}

export async function createPublicBooking(slug, input) {
  return request(`/api/public/${slug}/bookings`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
