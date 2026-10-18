jest.mock('../../../config/database', () => require('../../../__mocks__/config/database'));
jest.mock('../../../utils/rsiProfileScraper');

const { execute } = require('../../../commands/admin/manual-verify');
const { VerifiedUser, OrgTag } = require('../../../config/database');
const { fetchRsiProfileInfo } = require('../../../utils/rsiProfileScraper');
const { MessageFlags } = require('discord.js');

const createInteraction = (hasPerm = true) => {
  const memberObj = {
    displayName: 'Tester ⛔',
    setNickname: jest.fn(),
    roles: { cache: { has: jest.fn().mockReturnValue(true), remove: jest.fn(), add: jest.fn() } }
  };
  return {
    member: { permissions: { has: jest.fn(() => hasPerm) } },
    options: {
      getUser: jest.fn(() => ({ id: 'u1', username: 'Tester' })),
      getString: jest.fn(() => 'TestHandle')
    },
    guild: {
      members: { fetch: jest.fn(() => memberObj) },
      roles: { cache: { find: jest.fn(fn => [
        { name: 'Recruit', id: 'r1' },
        { name: 'Deckhand', id: 'r2' },
        { name: 'Pyro Freelancer Corps', id: 'r3' }
      ].find(fn)) } }
    },
    reply: jest.fn()
  };
};


let errorSpy;
let warnSpy;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('/manual-verify command', () => {
  it('rejects when user lacks permission', async () => {
    const interaction = createInteraction(false);
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Only moderators or administrators'),
      flags: MessageFlags.Ephemeral
    }));
  });

  it('rejects when handle already linked', async () => {
    const interaction = createInteraction(true);
    VerifiedUser.findOne.mockResolvedValue({ discordUserId: 'other' });
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('already linked'),
      flags: MessageFlags.Ephemeral
    }));
  });

  it('verifies user successfully', async () => {
    const interaction = createInteraction(true);
    VerifiedUser.findOne.mockResolvedValue(null);
    fetchRsiProfileInfo.mockResolvedValue({ orgId: 'PFCS' });
    OrgTag.findByPk.mockResolvedValue({ tag: 'PFC' });
    VerifiedUser.upsert.mockResolvedValue();

    await execute(interaction);

    expect(fetchRsiProfileInfo).toHaveBeenCalledWith('TestHandle');
    expect(VerifiedUser.upsert).toHaveBeenCalledWith(expect.objectContaining({
      discordUserId: 'u1',
      rsiHandle: 'TestHandle',
      rsiOrgId: 'PFCS'
    }));
    expect(interaction.guild.members.fetch).toHaveBeenCalledWith('u1');
    const fetchedMember = interaction.guild.members.fetch.mock.results[0].value;
    expect(fetchedMember.setNickname).toHaveBeenCalledWith('[PFC] Tester');
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('manually verified'),
      flags: MessageFlags.Ephemeral
    }));
  });

  it('handles database failures gracefully', async () => {
    const interaction = createInteraction(true);
    VerifiedUser.findOne.mockResolvedValue(null);
    fetchRsiProfileInfo.mockResolvedValue({ orgId: 'PFCS' });
    VerifiedUser.upsert.mockRejectedValue(new Error('fail'));

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Failed to manually verify'),
      flags: MessageFlags.Ephemeral
    }));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('updates nickname even when org tag is unknown', async () => {
    const interaction = createInteraction(true);
    VerifiedUser.findOne.mockResolvedValue(null);
    fetchRsiProfileInfo.mockResolvedValue({ orgId: 'UNKNOWN' });
    OrgTag.findByPk.mockResolvedValue(null);
    VerifiedUser.upsert.mockResolvedValue();

    await execute(interaction);

    const fetchedMember = interaction.guild.members.fetch.mock.results[0].value;
    expect(fetchedMember.setNickname).toHaveBeenCalledWith('Tester');
  });
});
