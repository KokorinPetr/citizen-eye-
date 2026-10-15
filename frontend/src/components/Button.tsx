import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Button.module.css";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost";

interface CommonProps {
  variant?: Variant;
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
}

function classes(variant: Variant, block: boolean, extra?: string): string {
  return [styles.button, styles[variant], block && styles.block, extra].filter(Boolean).join(" ");
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "primary", icon, block = false, children, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={classes(variant, block, className)} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends CommonProps {
  to?: string;
  href?: string;
}

/** A link that looks like a button: `to` for app routes, `href` for tel: / external links. */
export function ButtonLink({ variant = "primary", icon, block = false, children, to, href }: ButtonLinkProps) {
  const content = (
    <>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes(variant, block)}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={classes(variant, block)}>
      {content}
    </a>
  );
}
