import React from 'react';

export const FieldError: React.FC<{
  error?: string;
  message?: string;
  id?: string;
  className?: string;
}> = ({ error, message, id, className = '' }) => {
  const display = error || message;
  if (!display) return null;
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className={`mt-1.5 text-xs font-medium text-rose-400 ${className}`}
    >
      {display}
    </p>
  );
};
