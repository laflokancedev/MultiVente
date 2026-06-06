import type { AssistedPayload } from '@multimarket/shared';

export type ShareOutcome = 'shared' | 'shared-text' | 'unsupported';

async function fetchAsFiles(urls: string[]): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    files.push(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }));
  }
  return files;
}

export async function shareAssisted(payload: AssistedPayload): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (data?: unknown) => boolean };
  if (typeof nav.share !== 'function') return 'unsupported';
  try {
    const files = await fetchAsFiles(payload.photoUrls);
    if (files.length > 0 && nav.canShare?.({ files })) {
      await nav.share({ files, text: payload.pasteText, url: payload.deepLink } as ShareData);
      return 'shared';
    }
  } catch {
    // fall through to text-only share
  }
  try {
    await nav.share({ text: payload.pasteText, url: payload.deepLink });
    return 'shared-text';
  } catch {
    return 'unsupported';
  }
}

export async function downloadPhotos(urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `photo-${i + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
