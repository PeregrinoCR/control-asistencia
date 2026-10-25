import { THEME_LABEL, useTheme, type Theme } from '../lib/theme';
import { Icon, type IconName } from './Icon';

const ORDER: Theme[] = ['auto', 'light', 'dark'];
const ICON: Record<Theme, IconName> = { auto: 'monitor', light: 'sun', dark: 'moon' };

/** One tap changes the look: automático (follows the device) → claro → oscuro. */
export function ThemeButton({ className, short }: { className?: string; short?: boolean }) {
  const [theme, setTheme] = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <button type="button" className={className} onClick={() => setTheme(next)} aria-label={`Tema: ${THEME_LABEL[theme]}. Cambiar a ${THEME_LABEL[next].toLowerCase()}`} title={`Tema: ${THEME_LABEL[theme]}`}>
      <span className="admin__link-main">
        <Icon name={ICON[theme]} size={18} />
        {short ? THEME_LABEL[theme] : `Tema: ${THEME_LABEL[theme]}`}
      </span>
    </button>
  );
}
