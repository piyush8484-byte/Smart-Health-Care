import { parseOriginList } from '../src/config/env';

describe('environment parsing', () => {
  it('trims and deduplicates comma-separated origins', () => {
    expect(parseOriginList('https://app.example.com, https://admin.example.com,https://app.example.com')).toEqual([
      'https://app.example.com',
      'https://admin.example.com'
    ]);
  });
});
