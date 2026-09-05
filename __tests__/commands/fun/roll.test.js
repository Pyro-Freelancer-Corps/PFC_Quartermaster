jest.mock('../../../utils/parseDice');

const parseDice = require('../../../utils/parseDice');
const roll = require('../../../commands/fun/roll');
const { MessageFlags } = require('../../../__mocks__/discord.js');

beforeEach(() => {
  jest.clearAllMocks();
});

test('sends embed with dice result', async () => {
  parseDice.mockReturnValue({ total: 7, rolls: ['3', '4'] });

  const interaction = {
    options: { getString: jest.fn(key => (key === 'formula' ? '2d4' : 'test')) },
    reply: jest.fn(),
  };
  await roll.execute(interaction);

  expect(parseDice).toHaveBeenCalledWith('2d4');
  expect(interaction.reply).toHaveBeenCalled();
  const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
  expect(embed.title).toContain('Dice Roll');
  expect(embed.fields[1].value).toBe('**7**');
});

test('sends embed without reason when not provided', async () => {
  parseDice.mockReturnValue({ total: 4, rolls: ['4'] });
  const interaction = { options: { getString: jest.fn(key => (key === 'formula' ? 'd4' : null)) }, reply: jest.fn() };

  await roll.execute(interaction);

  const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
  expect(embed.footer).toEqual({ text: null });
});

test('handles invalid formula error by showing the specific reason, not a generic message', async () => {
  parseDice.mockImplementation(() => { throw new Error('Unsupported die: d3. Valid dice are d4, d6, d8, d10, d12, d20, d100.'); });
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const interaction = { options: { getString: jest.fn(() => '1d3') }, reply: jest.fn() };

  await roll.execute(interaction);

  expect(interaction.reply).toHaveBeenCalledWith({
    content: '❌ Unsupported die: d3. Valid dice are d4, d6, d8, d10, d12, d20, d100.',
    flags: MessageFlags.Ephemeral,
  });
  // a rejected formula is expected user-input, not an operational bug — no full stack trace log
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported die: d3'));
  expect(errSpy).not.toHaveBeenCalled();
  warnSpy.mockRestore();
  errSpy.mockRestore();
});

