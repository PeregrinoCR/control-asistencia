import { useEffect } from 'react';
import { BrowserRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { routes } from './routes';
import { ScreenIndex } from './screens/ScreenIndex';
import { Assignments } from './screens/admin/Assignments';
import { TeacherAbsences } from './screens/admin/TeacherAbsences';
import { EarlyWarning } from './screens/admin/EarlyWarning';
import { Justifications } from './screens/admin/Justifications';
import { Notices } from './screens/admin/Notices';
import { Reports } from './screens/admin/Reports';
import { Settings } from './screens/admin/Settings';
import { Students } from './screens/admin/Students';
import { Today } from './screens/admin/Today';
import { Trips } from './screens/admin/Trips';
import { EarlyExit } from './screens/mobile/EarlyExit';
import { FamilyHome } from './screens/mobile/FamilyHome';
import { FamilySettings } from './screens/mobile/FamilySettings';
import { Gate } from './screens/mobile/Gate';
import { StudentCardScreen } from './screens/mobile/StudentCardScreen';
import { WeeklySchedule } from './screens/mobile/WeeklySchedule';
import { History } from './screens/mobile/History';
import { Justify } from './screens/mobile/Justify';
import { PushPreview } from './screens/mobile/PushPreview';
import { RollCall } from './screens/mobile/RollCall';
import { TripConsent } from './screens/mobile/TripConsent';

// Hosted previews can't use URL paths, so they keep the route in memory.
const inPreview = import.meta.env.VITE_ROUTER === 'memory';
const Router = inPreview ? MemoryRouter : BrowserRouter;

/** With no address bar in the preview, this is the way back to the screen list. */
function PreviewHome() {
  const { pathname } = useLocation();
  if (pathname === routes.index) return null;
  return (
    <Link to={routes.index} className="btn btn--dark btn--md preview-home">
      Todas las pantallas
    </Link>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <Router>
      <ScrollToTop />
      {inPreview && <PreviewHome />}
      <Routes>
        <Route path={routes.index} element={<ScreenIndex />} />

        <Route path={routes.teacher.rollCall} element={<RollCall />} />

        <Route path={routes.family.home} element={<FamilyHome />} />
        <Route path={routes.family.push} element={<PushPreview />} />
        <Route path={routes.family.justify} element={<Justify />} />
        <Route path={routes.family.history} element={<History />} />
        <Route path={routes.family.trip} element={<TripConsent />} />
        <Route path={routes.family.earlyExit} element={<EarlyExit />} />
        <Route path={routes.family.settings} element={<FamilySettings />} />
        <Route path={routes.family.card} element={<StudentCardScreen />} />
        <Route path={routes.family.schedule} element={<WeeklySchedule />} />

        <Route path={routes.guard.gate} element={<Gate />} />

        <Route path={routes.admin.today} element={<Today />} />
        <Route path={routes.admin.assignments} element={<Assignments />} />
        <Route path={routes.admin.teacherAbsences} element={<TeacherAbsences />} />
        <Route path={routes.admin.trips} element={<Trips />} />
        <Route path={routes.admin.students} element={<Students />} />
        <Route path={routes.admin.justifications} element={<Justifications />} />
        <Route path={routes.admin.notices} element={<Notices />} />
        <Route path={routes.admin.earlyWarning} element={<EarlyWarning />} />
        <Route path={routes.admin.reports} element={<Reports />} />
        <Route path={routes.admin.settings} element={<Settings />} />

        <Route path="*" element={<Navigate to={routes.index} replace />} />
      </Routes>
    </Router>
  );
}
