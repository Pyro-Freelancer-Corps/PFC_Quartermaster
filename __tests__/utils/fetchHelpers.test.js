const { fetchSCData } = require('../../utils/fetchSCData');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('fetch helpers', () => {
  let errorSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('fetchSCData', () => {
    test('returns data on success', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 1 }], links: { next: null } })
      });
      const result = await fetchSCData('ships');
      expect(result).toEqual([{ id: 1 }]);
    });

    // A total failure must not resolve to [] - callers only check
    // Array.isArray, so an empty array reads as a successful sync of 0 rows.
    test('throws on http error', async () => {
      fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'err' });
      await expect(fetchSCData('ships')).rejects.toThrow('Failed to fetch page 1');
    });

    test('throws on malformed json', async () => {
      fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      await expect(fetchSCData('ships')).rejects.toThrow("Expected array in 'data'");
    });

    test('throws on network error', async () => {
      fetch.mockRejectedValue(new Error('net'));
      await expect(fetchSCData('ships')).rejects.toThrow('net');
    });
  });
});
