export function formatDateTime(iso, timezone) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export function formatTime(iso, timezone) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export function minutesToTimeInput(minutes) {
  const safe = Math.max(0, Math.min(1439, minutes));
  const hour = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const minute = (safe % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

export function timeInputToMinutes(value) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

export function nextDateString() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
