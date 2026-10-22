import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  /** What the person can do next, usually a Button or ButtonLink. */
  action?: ReactNode;
}

/** Shown where a list has nothing yet: says why and what to do about it. */
export function EmptyState({ title, children, icon = 'check', action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="empty-state__title">{title}</span>
      {children && <span className="text-sm muted">{children}</span>}
      {action}
    </div>
  );
}
