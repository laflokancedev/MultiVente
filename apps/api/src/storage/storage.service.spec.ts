import { StorageService } from './storage.service';

describe('StorageService.buildKey', () => {
  const svc = new StorageService();

  it('namespaces keys by user and listing and keeps a safe filename', () => {
    const key = svc.buildKey('user1', 'listingA', 'My Photo!.JPG');
    expect(key.startsWith('user1/listingA/')).toBe(true);
    expect(key.endsWith('-my-photo-.jpg')).toBe(true);
  });

  it('builds a public url from the configured base', () => {
    process.env.S3_PUBLIC_URL = 'http://localhost:9000/multimarket';
    expect(svc.publicUrl('user1/listingA/x-y.jpg'))
      .toBe('http://localhost:9000/multimarket/user1/listingA/x-y.jpg');
  });
});
