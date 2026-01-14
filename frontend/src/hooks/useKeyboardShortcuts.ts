import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutConfig {
  key: string;
  ctrlOrCmd?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const isCtrlOrCmd = event.ctrlKey || event.metaKey;
        const matchesModifier = shortcut.ctrlOrCmd ? isCtrlOrCmd : !isCtrlOrCmd;

        if (event.key.toLowerCase() === shortcut.key.toLowerCase() && matchesModifier) {
          event.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

export function useDashboardShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: 'k',
      ctrlOrCmd: true,
      action: () => navigate('/app/search'),
      description: 'Quick search',
    },
    {
      key: 'n',
      ctrlOrCmd: true,
      action: () => navigate('/app/campaigns'),
      description: 'New campaign',
    },
    {
      key: 'd',
      ctrlOrCmd: true,
      action: () => navigate('/app/dashboard'),
      description: 'Go to dashboard',
    },
    {
      key: 'c',
      ctrlOrCmd: true,
      action: () => navigate('/app/command-center'),
      description: 'Command center',
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}
