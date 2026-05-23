import { Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingScreen } from './components/LoadingScreen'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './layouts/AdminLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminCalendarPage } from './pages/admin/AdminCalendarPage'
import { AdminCanteenPage } from './pages/admin/AdminCanteenPage'
import { AdminClientsPage } from './pages/admin/AdminClientsPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminFinancePage } from './pages/admin/AdminFinancePage'
import { AdminReceptionPage } from './pages/admin/AdminReceptionPage'
import { AdminReportsPage } from './pages/admin/AdminReportsPage'
import { AdminReservationsPage } from './pages/admin/AdminReservationsPage'
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { ContactPage } from './pages/ContactPage'
import { LandingPage } from './pages/LandingPage'
import { CanteenPage } from './pages/CanteenPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PricesPage } from './pages/PricesPage'
import { ReceptionPage } from './pages/ReceptionPage'
import { TVPage } from './pages/TVPage'

function App() {
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    const bootTimer = window.setTimeout(() => setIsBooting(false), 450)
    return () => window.clearTimeout(bootTimer)
  }, [])

  if (isBooting) {
    return <LoadingScreen />
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="disponibilidad" element={<AvailabilityPage />} />
          <Route path="precios" element={<PricesPage />} />
          <Route path="contacto" element={<ContactPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="recepcion" element={<AdminReceptionPage />} />
            <Route path="reservas" element={<AdminReservationsPage />} />
            <Route path="calendario" element={<AdminCalendarPage />} />
            <Route path="cantina" element={<AdminCanteenPage />} />
            <Route path="finanzas" element={<AdminFinancePage />} />
            <Route path="reportes" element={<AdminReportsPage />} />
            <Route path="clientes" element={<AdminClientsPage />} />
            <Route path="configuracion" element={<AdminSettingsPage />} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Route>
          <Route path="cantina" element={<CanteenPage />} />
          <Route path="recepcion" element={<ReceptionPage />} />
          <Route path="tv" element={<TVPage />} />
        </Route>
        <Route path="login" element={<LoginPage />} />
        <Route path="inicio" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
