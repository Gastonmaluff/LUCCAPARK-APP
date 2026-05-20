import { Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingScreen } from './components/LoadingScreen'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminPage } from './pages/AdminPage'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { ContactPage } from './pages/ContactPage'
import { LandingPage } from './pages/LandingPage'
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
        <Route path="admin" element={<AdminPage />} />
        <Route path="recepcion" element={<ReceptionPage />} />
        <Route path="tv" element={<TVPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="inicio" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
