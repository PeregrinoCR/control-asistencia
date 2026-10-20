import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';

/** Familia · Ajustes. Not in the design yet: holds the tab bar destination. */
export function FamilySettings() {
  return (
    <MobileScreen>
      <ScreenHeader title="Ajustes" />
      <div className="screen-body">
        <div className="card card--mobile muted" style={{ fontSize: 15 }}>
          [AJUSTES DE LA CUENTA]
        </div>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
