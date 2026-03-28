import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import AvailabilityPage from "./pages/AvailabilityPage";
import BookingConfirmationPage from "./pages/BookingConfirmationPage";
import BookingsPage from "./pages/BookingsPage";
import EventTypesPage from "./pages/EventTypesPage";
import PublicBookingPage from "./pages/PublicBookingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/event-types" replace />} />

      <Route element={<AdminLayout />}>
        <Route path="/event-types" element={<EventTypesPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
      <Route path="/availability" element={<AvailabilityPage />} />
    </Route>

      <Route path="/aditi-singh-y8hgdr/:slug" element={<PublicBookingPage />} />
      <Route path="/book/:slug" element={<PublicBookingPage />} />
      <Route path="/book/:slug/confirmation/:bookingId" element={<BookingConfirmationPage />} />
    </Routes>
  );
}
