import { cx } from './cx';

/** First letter of the first name and of the first surname. */
export function initials(name: string) {
  const parts = name.split(' ');
  return (parts[0][0] ?? '') + (parts[1]?.[0] ?? '');
}

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'base' | 'lg';
  tone?: 'blue' | 'orange';
}

export function Avatar({ name, size = 'base', tone }: AvatarProps) {
  return (
    <span aria-hidden="true" className={cx('avatar', size !== 'base' && `avatar--${size}`, tone && `avatar--${tone}`)}>
      {initials(name)}
    </span>
  );
}
