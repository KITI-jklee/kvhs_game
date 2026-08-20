import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'accent' | 'ink' | 'outline' | 'outlineMuted' | 'text';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  capOnDesktop?: boolean;
}

export function Button({ variant = 'accent', capOnDesktop, className, ...rest }: ButtonProps) {
  const classes = [styles.btn, styles[variant], capOnDesktop ? styles.capOnDesktop : '', className]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...rest} />;
}
