const NOISE_TOKENS = new Set(['de', 'da', 'do', 'das', 'dos', 'di', 'du', 'e', 'y']);

export function getInitials(name: string | null | undefined, max = 2): string {
  if (!name) return '';

  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !NOISE_TOKENS.has(word.toLowerCase()));

  if (words.length === 0) return '';

  if (words.length === 1) {
    return words[0].slice(0, max).toUpperCase();
  }

  const firstLetters = words.map((word) => word[0]).join('');
  return firstLetters.slice(0, max).toUpperCase();
}
