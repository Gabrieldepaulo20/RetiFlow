import * as React from 'react';

export function getReactElementDisplayName(type: unknown): string | null {
  if ((typeof type !== 'function' && typeof type !== 'object') || type === null) {
    return null;
  }

  if (!('displayName' in type)) {
    return null;
  }

  const displayName = (type as { displayName?: unknown }).displayName;
  return typeof displayName === 'string' ? displayName : null;
}

export function elementHasDisplayName(child: React.ReactNode, displayName: string): boolean {
  if (!React.isValidElement(child)) return false;
  return getReactElementDisplayName(child.type) === displayName;
}
