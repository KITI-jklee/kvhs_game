import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import styles from './Button.module.css';

type Variant = 'accent' | 'ink' | 'outline' | 'outlineMuted' | 'text';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  capOnDesktop?: boolean;
}

export function Button({ variant = 'accent', capOnDesktop, className, ...rest }: ButtonProps) {
  const classes = cx(styles.btn, styles[variant], capOnDesktop && styles.capOnDesktop, className);
  return <button type="button" className={classes} {...rest} />;
}
