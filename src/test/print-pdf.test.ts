import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPdfFromUrl, downloadPdfUrl } from '@/lib/printPdf';

describe('printPdf download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('sanitiza o nome do arquivo ao disparar download por URL', () => {
    const click = vi.fn();
    const createdAnchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: click });
        createdAnchors.push(element as HTMLAnchorElement);
      }
      return element;
    });

    downloadPdfUrl('https://signed.example/arquivo.pdf?token=abc', 'Fechamento: Junho/2026');

    expect(click).toHaveBeenCalledTimes(1);
    const [createdAnchor] = createdAnchors;
    expect(createdAnchor?.download).toBe('Fechamento- Junho-2026.pdf');
    expect(createdAnchor?.target).toBe('_blank');
    expect(document.querySelector('a')).toBeNull();
  });

  it('cai para navegacao direta quando o fetch da signed URL e bloqueado', async () => {
    const click = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: click });
      }
      return element;
    });

    await expect(downloadPdfFromUrl('https://signed.example/arquivo.pdf?download=1', 'Fechamento Junho'))
      .resolves
      .toBeUndefined();

    expect(click).toHaveBeenCalledTimes(1);
  });
});
