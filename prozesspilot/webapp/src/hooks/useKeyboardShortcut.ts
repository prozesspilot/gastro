import { useEffect, useRef } from 'react';

/**
 * Registriert einen Keyboard-Shortcut.
 *
 * `keys` enthält die finale Taste optional mit Modifiern, z. B.:
 *   ['Mod+k']        — Cmd auf macOS / Ctrl sonst
 *   ['Ctrl+k']       — explizit Ctrl
 *   ['Escape']       — einzelne Taste
 *   ['j', 'k']       — mehrere alternative Tasten
 *
 * Modifier (case-insensitive): Mod, Ctrl, Cmd, Meta, Alt, Shift.
 * `Mod` mappt auf metaKey auf macOS und ctrlKey auf anderen Plattformen.
 */
export function useKeyboardShortcut(
  keys: string[] | string,
  callback: (e: KeyboardEvent) => void,
  options: { enabled?: boolean; preventDefault?: boolean } = {},
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabled = options.enabled ?? true;
  const preventDefault = options.preventDefault ?? true;

  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(keys) ? keys : [keys];
    const parsed = list.map(parseKeySpec);

    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

    function handler(e: KeyboardEvent) {
      for (const spec of parsed) {
        if (matches(e, spec, isMac)) {
          if (preventDefault) e.preventDefault();
          callbackRef.current(e);
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [JSON.stringify(keys), enabled, preventDefault]);
}

interface KeySpec {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  mod: boolean;
}

function parseKeySpec(spec: string): KeySpec {
  const parts = spec.split('+').map((p) => p.trim());
  const key = parts[parts.length - 1].toLowerCase();
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());

  return {
    key,
    ctrl: mods.includes('ctrl'),
    meta: mods.includes('cmd') || mods.includes('meta'),
    alt: mods.includes('alt'),
    shift: mods.includes('shift'),
    mod: mods.includes('mod'),
  };
}

function matches(e: KeyboardEvent, spec: KeySpec, isMac: boolean): boolean {
  const key = e.key.toLowerCase();
  if (key !== spec.key) return false;

  const ctrlExpected = spec.ctrl || (spec.mod && !isMac);
  const metaExpected = spec.meta || (spec.mod && isMac);

  if (ctrlExpected !== e.ctrlKey) return false;
  if (metaExpected !== e.metaKey) return false;
  if (spec.alt !== e.altKey) return false;
  if (spec.shift !== e.shiftKey) return false;

  return true;
}
