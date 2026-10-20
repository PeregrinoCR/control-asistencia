import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'dark'
  | 'danger'
  | 'danger-outline'
  | 'outline-blue'
  | 'quiet'
  | 'dashed'
  | 'ghost'
  | 'ghost-danger';

export type ButtonSize = 'sm' | 'md' | 'base' | 'lg' | 'xl';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Lighter label weight, used by the secondary actions in admin page headers. */
  regular?: boolean;
}

function buttonClass({ variant = 'secondary', size = 'base', block, regular }: StyleProps, extra?: string) {
  return cx(
    'btn',
    `btn--${variant}`,
    size !== 'base' && `btn--${size}`,
    block && 'btn--block',
    regular && 'btn--regular',
    extra,
  );
}

type ButtonProps = StyleProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** For primary buttons that stay clickable but look inactive until the form is complete. */
    ready?: boolean;
  };

export function Button({ variant, size, block, regular, ready, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-ready={ready === undefined ? undefined : String(ready)}
      className={buttonClass({ variant, size, block, regular }, className)}
      {...rest}
    />
  );
}

type ButtonLinkProps = StyleProps & { to: string; className?: string; children: ReactNode };

/** A navigation link styled as a button. */
export function ButtonLink({ variant, size, block, regular, className, to, children }: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass({ variant, size, block, regular }, className)}>
      {children}
    </Link>
  );
}

type ButtonAnchorProps = StyleProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** A plain anchor (tel:, mailto:, downloads) styled as a button. */
export function ButtonAnchor({ variant, size, block, regular, className, ...rest }: ButtonAnchorProps) {
  return <a className={buttonClass({ variant, size, block, regular }, className)} {...rest} />;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  /** Shows a small unread dot in the corner. */
  dot?: boolean;
};

export function IconButton({ icon, label, dot, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} className={cx('icon-btn', className)} {...rest}>
      <Icon name={icon} />
      {dot && <span className="icon-btn__dot" />}
    </button>
  );
}

export function IconLink({ icon, label, to }: { icon: IconName; label: string; to: string }) {
  return (
    <Link to={to} aria-label={label} className="icon-btn">
      <Icon name={icon} />
    </Link>
  );
}
