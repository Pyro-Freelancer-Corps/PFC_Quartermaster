jest.mock('../config/database', () => require('../__mocks__/config/database'));
jest.mock('../utils/rsiProfileScraper');

const { execute, button } = require('../commands/user/verify');
const { VerifiedUser, VerificationCode, OrgTag } = require('../config/database');
const { fetchRsiProfileInfo } = require('../utils/rsiProfileScraper');
const { MessageFlags } = require('discord.js');

beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterAll(() => {
    console.warn.mockRestore();
    console.error.mockRestore();
  });

describe('/verify command tests - Edge Cases', () => {
  let mockInteraction;
  const mockRoles = {
    cache: {
      find: jest.fn((fn) => [
        { name: 'Recruit', id: 'role1' },
        { name: 'Deckhand', id: 'role2' },
        { name: 'Pyro Freelancer Corps', id: 'role3' }
      ].find(fn))
    }
  };

  beforeEach(() => {
    mockInteraction = {
      user: { id: '12345', username: 'TestUser' },
      member: {
        displayName: 'TestUser',
        setNickname: jest.fn(),
        roles: { cache: { has: jest.fn().mockReturnValue(true), remove: jest.fn(), add: jest.fn() } }
      },
      options: { getString: jest.fn() },
      deferReply: jest.fn().mockResolvedValue(),
      editReply: jest.fn().mockResolvedValue(),
      guild: { roles: mockRoles },
    };
  });

  const testCases = [
    { name: 'existing verification linked to another user', setup: () => VerifiedUser.findOne.mockResolvedValue({ discordUserId: '67890' }), expectText: 'already linked to another Discord user' },
    { name: 'successful execution sends verification instructions', setup: () => { VerifiedUser.findOne.mockResolvedValue(null); VerificationCode.upsert.mockResolvedValue(); }, expectText: "Let's get you verified" }
  ];

  testCases.forEach(({ name, setup, expectText }) => {
    it(`should handle ${name}`, async () => {
      mockInteraction.options.getString.mockReturnValue('TestHandle');
      setup();
      await execute(mockInteraction);
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining(expectText) })
      );
    });
  });

  describe('button interaction edge cases', () => {
    let mockButtonInteraction;

    beforeEach(() => {
        mockButtonInteraction = {
          customId: 'verify_now::TestHandle::PFC-ABC123',
          user: { id: '12345', username: 'TestUser' },
          member: {
            displayName: 'TestUser',
            setNickname: jest.fn(),
            roles: {
              cache: {
                has: jest.fn().mockReturnValue(true), // Simulate Recruit role present
              },
              remove: jest.fn().mockResolvedValue(), // Properly mocked remove
              add: jest.fn().mockResolvedValue()     // Properly mocked add
            }
          },
          deferUpdate: jest.fn().mockResolvedValue(),
          editReply: jest.fn().mockResolvedValue(),
          guild: { roles: mockRoles },
        };
      });
      

    it('should handle missing code in bio', async () => {
      fetchRsiProfileInfo.mockResolvedValue({ handle: 'TestHandle', bio: 'No code here', orgId: 'PFCS' });
      await button(mockButtonInteraction);
      expect(mockButtonInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("Couldn't find the code") })
      );
    });

    it('should handle successful verification with nickname update', async () => {
      fetchRsiProfileInfo.mockResolvedValue({ handle: 'TestHandle', bio: 'PFC-ABC123', orgId: 'PFCS' });
      OrgTag.findByPk.mockResolvedValue({ tag: 'PFC' });
      VerifiedUser.upsert.mockResolvedValue();
      await button(mockButtonInteraction);
      expect(mockButtonInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("You're verified as **TestHandle**") })
      );
    });

    it('should handle missing org tag gracefully', async () => {
      fetchRsiProfileInfo.mockResolvedValue({ handle: 'TestHandle', bio: 'PFC-ABC123', orgId: 'PFCS' });
      OrgTag.findByPk.mockResolvedValue(null);
      VerifiedUser.upsert.mockResolvedValue();
      await button(mockButtonInteraction);
      expect(mockButtonInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("You're verified as **TestHandle**") })
      );
    });

    it('should handle database failure gracefully', async () => {
      fetchRsiProfileInfo.mockResolvedValue({ handle: 'TestHandle', bio: 'PFC-ABC123', orgId: 'PFCS' });
      OrgTag.findByPk.mockResolvedValue({ tag: 'PFC' });
      VerifiedUser.upsert.mockRejectedValue(new Error('DB Failure'));
      await button(mockButtonInteraction);
      expect(mockButtonInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Something went wrong while verifying your profile') })
      );
    });
  });
});
