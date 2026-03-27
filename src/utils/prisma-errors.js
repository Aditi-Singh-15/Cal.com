export function isBookingOverlapError(error) {
  if (!error) {
    return false;
  }

  if (typeof error.code === "string" && error.code === "P2004") {
    return true;
  }

  if (typeof error.message === "string" && error.message.includes("exclusion constraint")) {
    return true;
  }

  const databaseError = error?.meta?.database_error;
  if (typeof databaseError === "string" && databaseError.includes("exclusion constraint")) {
    return true;
  }

  return false;
}
