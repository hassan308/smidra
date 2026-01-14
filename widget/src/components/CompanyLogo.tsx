import { useState } from 'react';
import clsx from 'clsx';

interface CompanyLogoProps {
  name: string;
  logoUrl?: string;
  size?: number;
  className?: string;
}

function getInitials(name: string): string {
  return name
    ? name
        .split(' ')
        .map(w => w[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : '?';
}

function getDomain(name: string): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/\s*(ab|hb|kb)\s*/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .replace(/[åäö]/g, c => (c === 'ö' ? 'o' : 'a'));
  return cleaned.length > 2 ? cleaned : null;
}

export function CompanyLogo({ name, logoUrl, size = 44, className }: CompanyLogoProps) {
  const [srcIndex, setSrcIndex] = useState(0);

  const domain = getDomain(name);
  const sources = [
    logoUrl,
    domain && `https://logo.clearbit.com/${domain}.se`,
    domain && `https://logo.clearbit.com/${domain}.com`,
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=7B9E87&color=fff&size=${size * 2}&bold=true&format=svg`
  ].filter(Boolean) as string[];

  if (srcIndex === -1 || !sources.length) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-xl bg-gradient-to-br from-[#7B9E87] to-[#5a7a65] text-white font-bold text-sm',
          className
        )}
        style={{ width: size, height: size }}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={sources[srcIndex]}
      alt={name}
      className={clsx('rounded-xl object-cover bg-gray-100 dark:bg-gray-800', className)}
      style={{ width: size, height: size }}
      onError={() => setSrcIndex(p => (p < sources.length - 1 ? p + 1 : -1))}
    />
  );
}
