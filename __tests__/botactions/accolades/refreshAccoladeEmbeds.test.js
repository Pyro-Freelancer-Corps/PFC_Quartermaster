jest.mock('../../../config/database', () => ({
  Accolade: {
    findAll: jest.fn()
  }
}));

jest.mock('../../../utils/accoladeEmbedBuilder', () => ({
  buildAccoladeEmbed: jest.fn(() => 'embed')
}));

jest.mock('../../../utils/fetchGuildMembers', () => ({
  fetchGuildMembers: jest.fn()
}));

const { Accolade } = require('../../../config/database');
const { buildAccoladeEmbed } = require('../../../utils/accoladeEmbedBuilder');
const { fetchGuildMembers } = require('../../../utils/fetchGuildMembers');
const { refreshAccoladeEmbeds } = require('../../../botactions/accolades/refreshAccoladeEmbeds');

describe('refreshAccoladeEmbeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fetchGuildMembers.mockResolvedValue([{ roles: { cache: { has: jest.fn(() => false) } } }]);
  });

  afterEach(() => {
    console.warn.mockRestore();
    console.error.mockRestore();
    console.log.mockRestore();
  });

  test('warns when guildId is missing', async () => {
    const client = { config: {}, guilds: { fetch: jest.fn() } };

    await refreshAccoladeEmbeds(client);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('guildId'));
    expect(client.guilds.fetch).not.toHaveBeenCalled();
  });

  test('refreshes existing accolade message', async () => {
    const edit = jest.fn();
    const channel = {
      type: 0,
      messages: { fetch: jest.fn().mockResolvedValue({ edit }) },
      send: jest.fn()
    };

    const role = { iconURL: jest.fn(() => 'https://icon.url') };
    const member = { roles: { cache: { has: jest.fn(() => true) } } };
    fetchGuildMembers.mockResolvedValue([member]);

    const client = {
      config: { guildId: 'guild-1' },
      guilds: {
        fetch: jest.fn().mockResolvedValue({
          channels: { fetch: jest.fn().mockResolvedValue(channel) },
          members: {
            fetch: jest.fn().mockResolvedValue(),
            cache: {
              filter: jest.fn(fn => ({
                map: mapFn => {
                  const keep = fn(member);
                  return keep ? [mapFn(member)] : [];
                }
              }))
            }
          },
          roles: {
            fetch: jest.fn().mockResolvedValue(),
            cache: { get: jest.fn(() => role) }
          }
        })
      }
    };

    const accolade = {
      name: 'Valor',
      role_id: 'role-1',
      channel_id: 'channel-1',
      message_id: 'message-1',
      save: jest.fn(),
      date_modified: null
    };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(client.guilds.fetch).toHaveBeenCalledWith('guild-1');
    expect(buildAccoladeEmbed).toHaveBeenCalledWith(accolade, [member], role);
    expect(channel.messages.fetch).toHaveBeenCalledWith('message-1');
    expect(edit).toHaveBeenCalledWith({ embeds: ['embed'], content: '' });
    expect(accolade.save).toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  test('posts new message when existing one is missing', async () => {
    const send = jest.fn().mockResolvedValue({ id: 'new-id' });
    const channel = {
      type: 0,
      messages: { fetch: jest.fn().mockRejectedValue(new Error('not found')) },
      send
    };

    const role = { iconURL: jest.fn(() => null) };
    const member = { roles: { cache: { has: jest.fn(() => true) } } };
    fetchGuildMembers.mockResolvedValue([member]);

    const guild = {
      channels: { fetch: jest.fn().mockResolvedValue(channel) },
      members: {
        fetch: jest.fn().mockResolvedValue(),
        cache: {
          filter: jest.fn(fn => ({
            map: mapFn => {
              const keep = fn(member);
              return keep ? [mapFn(member)] : [];
            }
          }))
        }
      },
      roles: {
        fetch: jest.fn().mockResolvedValue(),
        cache: { get: jest.fn(() => role) }
      }
    };

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = {
      name: 'New',
      role_id: 'role-1',
      channel_id: 'channel-1',
      message_id: null,
      save: jest.fn(),
      date_modified: null
    };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ embeds: ['embed'] });
    expect(accolade.message_id).toBe('new-id');
    expect(accolade.save).toHaveBeenCalled();
  });

  test('posts new message when original message fetch fails', async () => {
    const send = jest.fn().mockResolvedValue({ id: 'fresh-id' });
    const channel = {
      type: 0,
      messages: { fetch: jest.fn().mockRejectedValue(new Error('missing')) },
      send
    };

    const role = { iconURL: jest.fn(() => 'https://icon.url') };
    const member = { roles: { cache: { has: jest.fn(() => true) } } };
    fetchGuildMembers.mockResolvedValue([member]);

    const guild = {
      channels: { fetch: jest.fn().mockResolvedValue(channel) },
      members: {
        fetch: jest.fn().mockResolvedValue(),
        cache: {
          filter: jest.fn(fn => ({
            map: mapFn => {
              const keep = fn(member);
              return keep ? [mapFn(member)] : [];
            }
          }))
        }
      },
      roles: {
        fetch: jest.fn().mockResolvedValue(role),
        cache: { get: jest.fn(() => role) }
      }
    };

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = {
      name: 'Repost',
      role_id: 'role-1',
      channel_id: 'channel-1',
      message_id: 'message-1',
      save: jest.fn()
    };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(channel.messages.fetch).toHaveBeenCalledWith('message-1');
    expect(send).toHaveBeenCalledWith({ embeds: ['embed'] });
    expect(accolade.message_id).toBe('fresh-id');
  });

  test('logs error when guild fetch fails', async () => {
    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockRejectedValue(new Error('guild missing')) }
    };

    Accolade.findAll.mockResolvedValue([]);

    await refreshAccoladeEmbeds(client);

    expect(client.guilds.fetch).toHaveBeenCalledWith('guild-1');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch guild'), expect.any(Error));
  });

  test('logs error when accolade query fails', async () => {
    const guild = {
      channels: { fetch: jest.fn() },
      members: { fetch: jest.fn(), cache: { filter: jest.fn() } },
      roles: { fetch: jest.fn(), cache: { get: jest.fn() } }
    };

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    Accolade.findAll.mockRejectedValue(new Error('db down'));

    await refreshAccoladeEmbeds(client);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load accolades'), expect.any(Error));
  });

  test('skips when channel is not text based', async () => {
    const guild = {
      channels: { fetch: jest.fn().mockResolvedValue({ type: 2 }) },
      roles: {
        fetch: jest.fn().mockResolvedValue(),
        cache: { get: jest.fn(() => ({ iconURL: jest.fn() })) }
      }
    };
    fetchGuildMembers.mockResolvedValue([{ roles: { cache: { has: jest.fn(() => true) } } }]);

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = { name: 'Invalid', role_id: 'role-1', channel_id: 'channel-1', save: jest.fn() };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('target channel unavailable'));
    expect(buildAccoladeEmbed).not.toHaveBeenCalled();
  });

  test('skips when channel fetch fails', async () => {
    const guild = {
      channels: { fetch: jest.fn().mockRejectedValue(new Error('fetch fail')) },
      roles: {
        fetch: jest.fn().mockResolvedValue(),
        cache: { get: jest.fn(() => ({ iconURL: jest.fn() })) }
      }
    };
    fetchGuildMembers.mockResolvedValue([{ roles: { cache: { has: jest.fn(() => true) } } }]);

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = { name: 'ChannelFail', role_id: 'role-1', channel_id: 'channel-1', save: jest.fn() };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('target channel unavailable'));
    expect(buildAccoladeEmbed).not.toHaveBeenCalled();
  });

  test('warns when guild members cannot be fetched', async () => {
    fetchGuildMembers.mockResolvedValue([]);
    const guild = {
      channels: { fetch: jest.fn() },
      roles: { fetch: jest.fn(), cache: { get: jest.fn() } }
    };
    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };
    Accolade.findAll.mockResolvedValue([{ name: 'Test', role_id: 'role', channel_id: 'chan', save: jest.fn() }]);

    await refreshAccoladeEmbeds(client);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to fetch guild members'));
    expect(buildAccoladeEmbed).not.toHaveBeenCalled();
  });

  test('skips when role cannot be resolved', async () => {
    const channel = {
      type: 0,
      messages: { fetch: jest.fn() },
      send: jest.fn()
    };

    const roleFetch = jest.fn()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('role fetch failed'));

    const guild = {
      channels: { fetch: jest.fn().mockResolvedValue(channel) },
      roles: {
        fetch: roleFetch,
        cache: { get: jest.fn(() => null) }
      }
    };
    fetchGuildMembers.mockResolvedValue([{ roles: { cache: { has: jest.fn(() => true) } } }]);
    fetchGuildMembers.mockResolvedValue([{ roles: { cache: { has: jest.fn(() => true) } } }]);

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = { name: 'Lost', role_id: 'role-1', channel_id: 'channel-1', save: jest.fn() };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('associated role missing'));
    expect(buildAccoladeEmbed).not.toHaveBeenCalled();
  });

  test('logs error when embed refresh fails mid-loop', async () => {
    const channel = {
      type: 0,
      messages: { fetch: jest.fn().mockResolvedValue(null) },
      send: jest.fn().mockRejectedValue(new Error('send failed'))
    };

    const role = { iconURL: jest.fn(() => null) };

    const guild = {
      channels: { fetch: jest.fn().mockResolvedValue(channel) },
      roles: {
        fetch: jest.fn().mockResolvedValue(role),
        cache: { get: jest.fn(() => role) }
      }
    };
    fetchGuildMembers.mockResolvedValue([]);

    const client = {
      config: { guildId: 'guild-1' },
      guilds: { fetch: jest.fn().mockResolvedValue(guild) }
    };

    const accolade = {
      name: 'Broken',
      role_id: 'role-1',
      channel_id: 'channel-1',
      message_id: 'missing',
      save: jest.fn()
    };

    Accolade.findAll.mockResolvedValue([accolade]);

    await refreshAccoladeEmbeds(client);
  });
});
