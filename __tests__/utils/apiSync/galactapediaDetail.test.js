jest.mock('../../../utils/fetchSCData', () => ({ fetchSCDataByUrl: jest.fn() }));
jest.mock('../../../config/database', () => ({
  GalactapediaEntry: { findAll: jest.fn() },
  GalactapediaDetail: { upsert: jest.fn(), findAll: jest.fn() },
  GalactapediaCategory: { destroy: jest.fn(), bulkCreate: jest.fn() },
  GalactapediaTag: { destroy: jest.fn(), bulkCreate: jest.fn() },
  GalactapediaProperty: { destroy: jest.fn(), bulkCreate: jest.fn() },
  GalactapediaRelatedArticle: { destroy: jest.fn(), bulkCreate: jest.fn() },
}));

const { fetchSCDataByUrl } = require('../../../utils/fetchSCData');
const db = require('../../../config/database');
const { syncGalactapediaDetail, syncGalactapediaDetails } = require('../../../utils/apiSync/galactapediaDetail');

describe('syncGalactapediaDetail', () => {
  let errorSpy, logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('saves the article body keyed by entry_id', async () => {
    fetchSCDataByUrl.mockResolvedValue({
      data: { id: 'ignored', created_at: '2020-01-01', translations: { en_EN: '  text  ' } }
    });

    const res = await syncGalactapediaDetail({ api_url: 'url', id: 'E1' });

    expect(fetchSCDataByUrl).toHaveBeenCalledWith('url');
    expect(db.GalactapediaDetail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ entry_id: 'E1', content: 'text', created_at: '2020-01-01' })
    );
    expect(res).toBe(true);
  });

  test('trims content to the Discord embed limit', async () => {
    fetchSCDataByUrl.mockResolvedValue({
      data: { translations: { en_EN: 'a'.repeat(5000) } }
    });

    await syncGalactapediaDetail({ api_url: 'url', id: 'E2' });

    const { content } = db.GalactapediaDetail.upsert.mock.calls[0][0];
    expect(content).toHaveLength(4000);
  });

  test('maps categories and tags from the API id/name fields', async () => {
    fetchSCDataByUrl.mockResolvedValue({
      data: {
        translations: { en_EN: 'detail' },
        categories: [{ id: 'C1', name: 'Illegal Activity' }],
        tags: [{ id: 'T1', name: 'salamanders' }],
      }
    });

    const res = await syncGalactapediaDetail({ api_url: 'url2', id: 'E3' });

    expect(db.GalactapediaCategory.destroy).toHaveBeenCalledWith({ where: { entry_id: 'E3' } });
    expect(db.GalactapediaCategory.bulkCreate).toHaveBeenCalledWith([
      { entry_id: 'E3', category_id: 'C1', category_name: 'Illegal Activity' }
    ]);
    expect(db.GalactapediaTag.destroy).toHaveBeenCalledWith({ where: { entry_id: 'E3' } });
    expect(db.GalactapediaTag.bulkCreate).toHaveBeenCalledWith([
      { entry_id: 'E3', tag_id: 'T1', tag_name: 'salamanders' }
    ]);
    expect(res).toBe(true);
  });

  test('still stores properties and related articles when the API supplies them', async () => {
    fetchSCDataByUrl.mockResolvedValue({
      data: {
        translations: { en_EN: 'detail' },
        properties: [{ name: 'Key', value: 'Val' }],
        related_articles: [{ id: 'R1', title: 'Rel', url: '/rel', api_url: 'relUrl' }],
      }
    });

    await syncGalactapediaDetail({ api_url: 'url3', id: 'E4' });

    expect(db.GalactapediaProperty.bulkCreate).toHaveBeenCalledWith([
      { entry_id: 'E4', name: 'Key', value: 'Val' }
    ]);
    expect(db.GalactapediaRelatedArticle.bulkCreate).toHaveBeenCalledWith([
      { entry_id: 'E4', related_id: 'R1', title: 'Rel', url: '/rel', api_url: 'relUrl' }
    ]);
  });

  test('skips empty collections rather than calling bulkCreate', async () => {
    fetchSCDataByUrl.mockResolvedValue({ data: { translations: { en_EN: 'detail' } } });

    await syncGalactapediaDetail({ api_url: 'url4', id: 'E5' });

    expect(db.GalactapediaCategory.bulkCreate).not.toHaveBeenCalled();
    expect(db.GalactapediaTag.bulkCreate).not.toHaveBeenCalled();
    expect(db.GalactapediaProperty.bulkCreate).not.toHaveBeenCalled();
    expect(db.GalactapediaRelatedArticle.bulkCreate).not.toHaveBeenCalled();
  });

  test('handles fetch failure gracefully', async () => {
    fetchSCDataByUrl.mockRejectedValue(new Error('fail'));
    const res = await syncGalactapediaDetail({ api_url: 'bad', id: 'E6' });
    expect(res).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  test('returns false when no detail content', async () => {
    fetchSCDataByUrl.mockResolvedValue({ data: null });
    const res = await syncGalactapediaDetail({ api_url: 'url', id: 'E7' });
    expect(res).toBe(false);
  });
});

describe('syncGalactapediaDetails', () => {
  let errorSpy, logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('only fetches entries that have no detail row yet', async () => {
    db.GalactapediaDetail.findAll.mockResolvedValue([{ entry_id: 'A' }]);
    db.GalactapediaEntry.findAll.mockResolvedValue([
      { id: 'A', api_url: 'urlA' },
      { id: 'B', api_url: 'urlB' },
    ]);
    fetchSCDataByUrl.mockResolvedValue({ data: { translations: { en_EN: 'text' } } });

    const res = await syncGalactapediaDetails({ delayMs: 0 });

    expect(fetchSCDataByUrl).toHaveBeenCalledTimes(1);
    expect(fetchSCDataByUrl).toHaveBeenCalledWith('urlB');
    expect(res).toEqual({ created: 1, updated: 0, skipped: 0, total: 1, remaining: 0 });
  });

  test('honours the batch limit and reports the remainder', async () => {
    db.GalactapediaDetail.findAll.mockResolvedValue([]);
    db.GalactapediaEntry.findAll.mockResolvedValue([
      { id: 'A', api_url: 'urlA' },
      { id: 'B', api_url: 'urlB' },
      { id: 'C', api_url: 'urlC' },
    ]);
    fetchSCDataByUrl.mockResolvedValue({ data: { translations: { en_EN: 'text' } } });

    const res = await syncGalactapediaDetails({ limit: 2, delayMs: 0 });

    expect(fetchSCDataByUrl).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ created: 2, updated: 0, skipped: 0, total: 2, remaining: 1 });
  });

  test('ignores entries with no api_url', async () => {
    db.GalactapediaDetail.findAll.mockResolvedValue([]);
    db.GalactapediaEntry.findAll.mockResolvedValue([{ id: 'A', api_url: null }]);

    const res = await syncGalactapediaDetails({ delayMs: 0 });

    expect(fetchSCDataByUrl).not.toHaveBeenCalled();
    expect(res).toEqual({ created: 0, updated: 0, skipped: 0, total: 0, remaining: 0 });
  });

  test('counts per-entry failures as skipped without aborting the run', async () => {
    db.GalactapediaDetail.findAll.mockResolvedValue([]);
    db.GalactapediaEntry.findAll.mockResolvedValue([
      { id: 'A', api_url: 'urlA' },
      { id: 'B', api_url: 'urlB' },
    ]);
    fetchSCDataByUrl
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: { translations: { en_EN: 'text' } } });

    const res = await syncGalactapediaDetails({ delayMs: 0 });

    expect(res).toEqual({ created: 1, updated: 0, skipped: 1, total: 2, remaining: 0 });
  });

  test('rethrows when the entry lookup fails', async () => {
    db.GalactapediaDetail.findAll.mockRejectedValue(new Error('db down'));
    await expect(syncGalactapediaDetails({ delayMs: 0 })).rejects.toThrow('db down');
    expect(errorSpy).toHaveBeenCalled();
  });
});
