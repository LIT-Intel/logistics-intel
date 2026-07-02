type ContactAvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<ContactAvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-16 w-16 text-lg',
};

export default function ContactAvatar({ name, src, size = 'sm', className = '' }: ContactAvatarProps) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('') || '•';

  const base = `${SIZE_CLASS[size]} overflow-hidden rounded-full border bg-slate-100 flex items-center justify-center font-semibold text-slate-600 ${className}`;

  if (src) {
    return (
      <div className={base}>
        <img src={src} alt={name || 'Contact avatar'} className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  return <div className={base}>{initials}</div>;
}
