import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getLogoDevPublishToken } from '@/lib/env';

type CompanyLogoProps = {
  domain?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: boolean;
};

const LOGO_BASE_URL = 'https://img.logo.dev';

export default function CompanyLogo({
  domain,
  name,
  size = 48,
  className,
  rounded = true,
}: CompanyLogoProps) {
  const token = getLogoDevPublishToken();
  const [prefersDark, setPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const trimmedDomain = (domain ?? '').trim().toLowerCase();

  const urls = useMemo(() => {
    if (!token || !trimmedDomain) return null;
    const params = new URLSearchParams({
      token,
      size: String(size),
      format: 'png',
    });
    if (prefersDark) params.set('dark', 'true');

    const pngUrl = `${LOGO_BASE_URL}/${trimmedDomain}?${params.toString()}`;
    params.set('format', 'webp');
    const webpUrl = `${LOGO_BASE_URL}/${trimmedDomain}?${params.toString()}`;

    return { pngUrl, webpUrl };
  }, [token, trimmedDomain, size, prefersDark]);

  const initials = useMemo(() => {
    if (typeof name !== 'string' || !name.trim()) return '?';
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [name]);

  const fallback = (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-xs font-semibold select-none border border-slate-200',
        rounded ? 'rounded-lg' : 'rounded-sm',
        className
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );

  if (!urls || errored) {
    return fallback;
  }

  return (
    <picture className={cn('inline-flex', className)} style={{ width: size, height: size }}>
      <source srcSet={urls.webpUrl} type="image/webp" />
      <img
        src={urls.pngUrl}
        alt={name ? `${name} logo` : 'Company logo'}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={cn('object-contain border border-slate-200 bg-white', rounded ? 'rounded-lg' : 'rounded-sm')}
        onError={() => setErrored(true)}
      />
    </picture>
  );
}
