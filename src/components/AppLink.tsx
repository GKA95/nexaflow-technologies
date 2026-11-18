import React from 'react';
import { useApp } from '../context/AppContext';

export interface AppLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

/**
 * Crawlable anchor link that renders real <a href="..."> elements for search engines
 * while using smooth client-side SPA navigation for normal internal left-clicks.
 */
export function AppLink({ to, onClick, target, rel, children, ...rest }: AppLinkProps) {
  const { navigate } = useApp();
  const isExternal = /^(https?:\/\/|mailto:|tel:)/i.test(to);
  const safeRel =
    isExternal && target === '_blank'
      ? rel || 'noopener noreferrer'
      : rel;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (isExternal || target === '_blank') return;
    if (to.startsWith('#')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    e.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} target={target} rel={safeRel} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
