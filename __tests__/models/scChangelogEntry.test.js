const defineModel = require('../../models/scChangelogEntry');

describe('ScChangelogEntry model', () => {
  test('defines fields and options', () => {
    const define = jest.fn(() => ({}));
    const sequelize = { define };
    const model = defineModel(sequelize);
    const [name, attrs, opts] = define.mock.calls[0];

    expect(name).toBe('ScChangelogEntry');
    expect(attrs).toHaveProperty('versionFrom');
    expect(attrs).toHaveProperty('versionTo');
    expect(attrs).toHaveProperty('category');
    expect(attrs).toHaveProperty('recordRef');
    expect(attrs).toHaveProperty('recordName');
    expect(attrs).toHaveProperty('recordType');
    expect(attrs).toHaveProperty('fieldKey');
    expect(attrs).toHaveProperty('label');
    expect(attrs).toHaveProperty('unit');
    expect(attrs).toHaveProperty('oldValue');
    expect(attrs).toHaveProperty('newValue');
    expect(attrs.dedupeKey.unique).toBe(true);
    expect(opts.charset).toBe('utf8mb4');
    expect(model).toEqual({});
  });
});
