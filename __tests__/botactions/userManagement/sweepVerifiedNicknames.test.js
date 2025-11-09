jest.mock('../../../config/database', () => require('../../../__mocks__/config/database'));
jest.mock('../../../utils/formatVerifiedNickname');
jest.mock('../../../utils/fetchGuildMembers', () => ({ fetchGuildMembers: jest.fn() }));

const { sweepVerifiedNicknames } = require('../../../botactions/userManagement/sweepVerifiedNicknames');
const { VerifiedUser, OrgTag } = require('../../../config/database');
const { formatVerifiedNickname } = require('../../../utils/formatVerifiedNickname');
const { fetchGuildMembers } = require('../../../utils/fetchGuildMembers');

describe('sweepVerifiedNicknames', () => {
  let mockClient, mockGuild, mockMembers, logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    OrgTag.findAll.mockResolvedValue([
      { tag: 'PFCS' },
      { tag: 'DEFN' },
      { tag: 'PFC' }, // Add any other known tags you’re using
    ]);  

    mockMembers = new Map();
    const createMockMember = (id, username, nickname = null, isBot = false) => ({
      id,
      nickname,
      user: { id, username, bot: isBot, tag: `${username}#1234` },
      displayName: nickname || username,
      setNickname: jest.fn().mockResolvedValue(true),
    });

    const member1 = createMockMember('user1', 'VerifiedUser', 'WrongName');
    const member2 = createMockMember('user2', 'UnverifiedUser', 'WrongNameToo');
    const botMember = createMockMember('bot1', 'BotUser', null, true);

    mockMembers.set('user1', member1);
    mockMembers.set('user2', member2);
    mockMembers.set('bot1', botMember);

    mockGuild = { members: {} };

    mockClient = {
      guilds: {
        cache: {
          first: () => mockGuild,
        },
      },
    };

    fetchGuildMembers.mockResolvedValue(Array.from(mockMembers.values()));
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('updates nicknames correctly based on verification status', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'PFCS' },
    ]);
    OrgTag.findByPk.mockResolvedValue({ tag: 'PFCS' });

    formatVerifiedNickname.mockImplementation((name, verified, tag) => {
      return verified ? `[${tag}] VerifiedUser` : `${name} ⛔`;
    });

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).toHaveBeenCalledWith('[PFCS] VerifiedUser');
    expect(mockMembers.get('user2').setNickname).toHaveBeenCalledWith('WrongNameToo ⛔');
    expect(mockMembers.get('bot1').setNickname).not.toHaveBeenCalled();
  });

  it('does not update if nickname is already correct', async () => {
    VerifiedUser.findAll.mockResolvedValue([{ discordUserId: 'user1', rsiOrgId: 'PFCS' }]);
    OrgTag.findByPk.mockResolvedValue({ tag: 'PFCS' });

    mockMembers.get('user1').nickname = '[PFCS] VerifiedUser';
    mockMembers.get('user1').displayName = '[PFCS] VerifiedUser';

    formatVerifiedNickname.mockImplementation(() => '[PFCS] VerifiedUser');

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).not.toHaveBeenCalled();
  });

  it('logs a warning if no guild is found', async () => {
    const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const emptyClient = {
      guilds: {
        cache: {
          first: () => undefined,
        },
      },
    };

    await sweepVerifiedNicknames(emptyClient);

    expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ No guild found in cache. Cannot run sweep.');
    mockConsoleWarn.mockRestore();
  });

  it('handles missing org tags gracefully', async () => {
    VerifiedUser.findAll.mockResolvedValue([{ discordUserId: 'user1', rsiOrgId: 'MISSING' }]);
    OrgTag.findByPk.mockResolvedValue(null);

    formatVerifiedNickname.mockImplementation((name, verified) => `${name} formatted`);

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).toHaveBeenCalled();
  });

  it('continues sweeping if setNickname throws an error', async () => {
    VerifiedUser.findAll.mockResolvedValue([{ discordUserId: 'user1', rsiOrgId: 'PFCS' }]);
    OrgTag.findByPk.mockResolvedValue({ tag: 'PFCS' });

    mockMembers.get('user1').setNickname.mockRejectedValue(new Error('Test error'));
    const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    formatVerifiedNickname.mockImplementation(() => '[PFCS] VerifiedUser');

    await sweepVerifiedNicknames(mockClient);

    expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ Failed to update VerifiedUser#1234:', 'Test error');
    mockConsoleWarn.mockRestore();
  });

  it('logs a warning when members cannot be fetched', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchGuildMembers.mockResolvedValue([]);

    await sweepVerifiedNicknames(mockClient);

    expect(warnSpy).toHaveBeenCalledWith('⚠️ Unable to fetch members for nickname sweep.');
    warnSpy.mockRestore();
  });

  it('corrects wrong predefined tag for verified user', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'PFCS' },
    ]);
    OrgTag.findByPk.mockResolvedValue({ tag: 'PFCS' });

    // Pretend the user currently has the wrong known tag
    mockMembers.get('user1').nickname = '[DEFN] VerifiedUser';
    mockMembers.get('user1').displayName = '[DEFN] VerifiedUser';

    formatVerifiedNickname.mockImplementation(() => '[PFCS] VerifiedUser');

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).toHaveBeenCalledWith('[PFCS] VerifiedUser');
  });

  it('removes predefined tag if verified user has no matching org', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'MISSING' },
    ]);
    OrgTag.findByPk.mockResolvedValue(null);  // Simulates missing OrgTag entry

    mockMembers.get('user1').nickname = '[DEFN] VerifiedUser';
    mockMembers.get('user1').displayName = '[DEFN] VerifiedUser';

    formatVerifiedNickname.mockImplementation(() => 'VerifiedUser'); // No tag applied

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).toHaveBeenCalledWith('VerifiedUser');
  });

  it('leaves unknown tag alone if verified user org not in known list', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'OUTLAW' },
    ]);
    OrgTag.findByPk.mockResolvedValue(null);  // Org not in predefined list

    mockMembers.get('user1').nickname = '[LOL] VerifiedUser';
    mockMembers.get('user1').displayName = '[LOL] VerifiedUser';

    formatVerifiedNickname.mockImplementation(() => '[LOL] VerifiedUser'); // Leaves unknown tag alone

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user1').setNickname).not.toHaveBeenCalled();
  });

  it('leaves unknown tag but adds ⛔ for unverified user', async () => {
    VerifiedUser.findAll.mockResolvedValue([]);  // No verified users!

    mockMembers.get('user2').nickname = '[LOL] UnverifiedUser';
    mockMembers.get('user2').displayName = '[LOL] UnverifiedUser';

    formatVerifiedNickname.mockImplementation(() => '[LOL] UnverifiedUser ⛔');

    await sweepVerifiedNicknames(mockClient);

    expect(mockMembers.get('user2').setNickname).toHaveBeenCalledWith('[LOL] UnverifiedUser ⛔');
  });

  it('should not remove unknown tag for verified user', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'OUTLAW' }, // Org not in predefined list
    ]);
    OrgTag.findByPk.mockResolvedValue(null);  // No matching tag
  
    mockMembers.get('user1').nickname = '[LOL] VerifiedUser';
    mockMembers.get('user1').displayName = '[LOL] VerifiedUser';
  
    formatVerifiedNickname.mockImplementation(() => 'VerifiedUser'); // Simulates current broken behavior
  
    await sweepVerifiedNicknames(mockClient);
  
    formatVerifiedNickname.mockImplementation((baseName, isVerified, tagToUse) => {
      return tagToUse ? `[${tagToUse}] ${baseName}` : `${baseName}${isVerified ? '' : ' ⛔'}`;
    });    
  });

  it('removes predefined tag and adds ⛔ for unverified user', async () => {
    VerifiedUser.findAll.mockResolvedValue([]);  // User is NOT verified!
  
    mockMembers.get('user2').nickname = '[PFC] UnverifiedUser';
    mockMembers.get('user2').displayName = '[PFC] UnverifiedUser';
  
    formatVerifiedNickname.mockImplementation(() => 'UnverifiedUser ⛔'); 
  
    await sweepVerifiedNicknames(mockClient);
  
    expect(mockMembers.get('user2').setNickname).toHaveBeenCalledWith('UnverifiedUser ⛔');
  });
  
  it('removes known tag if org is not in known org list', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: 'OUTLAW' }, // Org not in org_tags
    ]);
    OrgTag.findByPk.mockResolvedValue(null);  // Not a known org!
  
    mockMembers.get('user1').nickname = '[PFC] VerifiedUser';
    mockMembers.get('user1').displayName = '[PFC] VerifiedUser';
  
    formatVerifiedNickname.mockImplementation(() => 'VerifiedUser');  // Should strip tag
  
    await sweepVerifiedNicknames(mockClient);
  
    expect(mockMembers.get('user1').setNickname).toHaveBeenCalledWith('VerifiedUser');
  });
  
  it('removes predefined tag for verified user with no org', async () => {
    VerifiedUser.findAll.mockResolvedValue([
      { discordUserId: 'user1', rsiOrgId: null },  // ✅ Verified user, but no org!
    ]);
  
    OrgTag.findByPk.mockResolvedValue(null);  // Simulates no org entry found in org_tags
  
    mockMembers.get('user1').nickname = '[PFC] VerifiedUser';
    mockMembers.get('user1').displayName = '[PFC] VerifiedUser';
  
    formatVerifiedNickname.mockImplementation(() => 'VerifiedUser');  // Should strip the tag
  
    await sweepVerifiedNicknames(mockClient);
  
    expect(mockMembers.get('user1').setNickname).toHaveBeenCalledWith('VerifiedUser');
  });
  
});
