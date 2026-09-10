const { fetchSCData, fetchSCDataByUrl } = require('../../utils/fetchSCData');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('fetchSCData module', () => {
  let errorSpy, warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('fetchSCData', () => {
    test('paginates through multiple pages using provided params', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 1 }], links: { next: 'page2' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 2 }], links: { next: null } })
        });

      const result = await fetchSCData('ships', { foo: 'bar', limit: 25 });

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.star-citizen.wiki/api/v2/ships?foo=bar&limit=25&page=1'
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.star-citizen.wiki/api/v2/ships?foo=bar&limit=25&page=2'
      );
    });

    test('stops at meta.last_page even when links.next stays populated', async () => {
      // The live wiki API always returns a non-null links.next, so without
      // meta.last_page this would page forever.
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'x' }],
          meta: { last_page: 3 },
          links: { next: 'always-set' }
        })
      });

      const result = await fetchSCData('galactapedia');

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
    });

    test('stops when a page comes back empty', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 1 }], links: { next: 'always-set' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [], links: { next: 'always-set' } })
        });

      const result = await fetchSCData('galactapedia');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 1 }]);
    });

    test('keeps partial results when a later page fails', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 1 }], links: { next: 'page2' } })
        })
        .mockRejectedValueOnce(new Error('socket hang up'));

      const result = await fetchSCData('galactapedia');

      expect(result).toEqual([{ id: 1 }]);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('throws when the very first page fails, rather than reporting an empty sync', async () => {
      fetch.mockRejectedValue(new Error('socket hang up'));

      await expect(fetchSCData('galactapedia')).rejects.toThrow('socket hang up');
      expect(errorSpy).toHaveBeenCalled();
    });

    test('throws when a response is not ok on the first page', async () => {
      fetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

      await expect(fetchSCData('galactapedia')).rejects.toThrow('Failed to fetch page 1');
    });

    test('throws when data is not an array on the first page', async () => {
      fetch.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });

      await expect(fetchSCData('galactapedia')).rejects.toThrow("Expected array in 'data'");
    });
  });

  describe('fetchSCDataByUrl', () => {
    test('returns parsed json on success', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const data = await fetchSCDataByUrl('https://u');

      expect(fetch).toHaveBeenCalledWith('https://u', {
        headers: { Accept: 'application/json' }
      });
      expect(data).toEqual({ success: true });
    });

    test('throws when response is not ok', async () => {
      fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'err' });

      await expect(fetchSCDataByUrl('https://bad')).rejects.toThrow(
        'Failed to fetch https://bad: 500 err'
      );
    });
  });
});
