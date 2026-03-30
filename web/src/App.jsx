import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import RequireAuth from "./components/RequireAuth";
import AvailabilityPage from "./pages/AvailabilityPage";
import BookingConfirmationPage from "./pages/BookingConfirmationPage";
import BookingsPage from "./pages/BookingsPage";
import EventTypesPage from "./pages/EventTypesPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import PublicBookingPage from "./pages/PublicBookingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/event-types" replace />} />

      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/event-types" element={<EventTypesPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/availability" element={<AvailabilityPage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/:handle/:slug" element={<PublicBookingPage />} />
      <Route path="/:handle/:slug/confirmation/:bookingId" element={<BookingConfirmationPage />} />
    </Routes>
  );
}
