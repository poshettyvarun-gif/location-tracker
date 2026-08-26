import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import RequireRole from "./auth/RequireRole";
import LoginPage from "./auth/LoginPage";
import AdminLayout from "./admin/AdminLayout";
import AdminOverview from "./admin/AdminOverview";
import AdminPersonnel from "./admin/AdminPersonnel";
import AdminEmployeeDetail from "./admin/AdminEmployeeDetail";
import AdminLiveMap from "./admin/AdminLiveMap";
import AdminAttendanceReport from "./admin/AdminAttendanceReport";
import EmployeeDashboard from "./employee/EmployeeDashboard";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "employee" ? "/employee" : "/admin"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/admin"
            element={
              <RequireRole area="admin">
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="personnel" element={<AdminPersonnel />} />
            <Route path="map" element={<AdminLiveMap />} />
            <Route path="attendance" element={<AdminAttendanceReport />} />
            <Route path="employees/:id" element={<AdminEmployeeDetail />} />
          </Route>

          <Route
            path="/employee"
            element={
              <RequireRole area="employee">
                <EmployeeDashboard />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="bottom-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}
