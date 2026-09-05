jest.mock('../../../utils/parseDice');

const parseDice = require('../../../utils/parseDice');
const checkdc = require('../../../commands/fun/checkdc');
const { MessageFlags } = require('../../../__mocks__/discord.js');

function makePlayer(id) {
  return { id, toString: () => `<@${id}>` };
}

function makeGmInteraction({ dc = 15, reason = null, player = makePlayer('player-1') } = {}) {
  return {
    id: 'interaction-1',
    options: {
      getUser: jest.fn(() => player),
      getString: jest.fn(() => reason),
      getInteger: jest.fn(() => dc),
    },
    reply: jest.fn(),
    editReply: jest.fn(),
    channel: { send: jest.fn() },
  };
}

function makeButtonInteraction(checkId, player) {
  return {
    customId: `checkdc_roll::${checkId}`,
    user: player,
    reply: jest.fn(),
    showModal: jest.fn(),
  };
}

function makeRevealButtonInteraction(checkId, embeds) {
  return {
    customId: `checkdc_reveal::${checkId}`,
    message: { embeds },
    channel: { send: jest.fn() },
    reply: jest.fn(),
    update: jest.fn(),
  };
}

function makeModalInteraction(checkId, player, formula, { fromMessage = true } = {}) {
  return {
    customId: `checkdc_modal::${checkId}`,
    user: player,
    fields: { getTextInputValue: jest.fn(() => formula) },
    isFromMessage: jest.fn(() => fromMessage),
    update: jest.fn(),
    reply: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  checkdc.__resetPendingChecksForTests();
});

async function startCheck({ dc = 15, reason = null, player = makePlayer('player-1') } = {}) {
  const gmInteraction = makeGmInteraction({ dc, reason, player });
  await checkdc.execute(gmInteraction);
  return { gmInteraction, checkId: gmInteraction.id, player };
}

describe('execute', () => {
  test('replies to the GM ephemerally and posts a public roll prompt for the player, without leaking the DC', async () => {
    const player = makePlayer('player-1');
    const interaction = makeGmInteraction({ dc: 15, reason: 'Perception', player });

    await checkdc.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Perception'),
      flags: MessageFlags.Ephemeral,
    }));
    expect(interaction.channel.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('<@player-1>'),
      components: expect.any(Array),
    }));
    expect(interaction.channel.send.mock.calls[0][0].content).not.toContain('15');
  });
});

describe('button', () => {
  test('rejects a click from someone other than the tagged player', async () => {
    const { checkId } = await startCheck();
    const impostor = makeButtonInteraction(checkId, { id: 'someone-else' });

    await checkdc.button(impostor);

    expect(impostor.reply).toHaveBeenCalledWith({ content: expect.stringContaining("isn't for you"), flags: MessageFlags.Ephemeral });
    expect(impostor.showModal).not.toHaveBeenCalled();
  });

  test('rejects a click for a check that no longer exists', async () => {
    const interaction = makeButtonInteraction('unknown-id', makePlayer('player-1'));

    await checkdc.button(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining('expired or was already resolved'), flags: MessageFlags.Ephemeral });
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  test('shows the formula modal to the tagged player instead of rolling itself', async () => {
    const { checkId, player } = await startCheck();
    const interaction = makeButtonInteraction(checkId, player);

    await checkdc.button(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  describe('checkdc_reveal (Make Public)', () => {
    test('posts the ephemeral result embed publicly and removes the button', async () => {
      const embeds = [{ toJSON: () => ({ title: '✅ Check Passed' }) }];
      const interaction = makeRevealButtonInteraction('check-1', embeds);

      await checkdc.button(interaction);

      expect(interaction.channel.send).toHaveBeenCalledWith({
        content: expect.stringContaining('revealed'),
        embeds,
      });
      expect(interaction.update).toHaveBeenCalledWith({ components: [] });
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('does not need pendingChecks state — works even after the check has already been resolved and deleted', async () => {
      const embeds = [{ toJSON: () => ({ title: '❌ Check Failed' }) }];
      // 'never-existed' is never in pendingChecks at all, simulating the normal
      // post-roll state where the check entry has already been deleted.
      const interaction = makeRevealButtonInteraction('never-existed', embeds);

      await checkdc.button(interaction);

      expect(interaction.channel.send).toHaveBeenCalled();
      expect(interaction.update).toHaveBeenCalledWith({ components: [] });
    });

    test('replies with an error and leaves the button in place if the public post fails', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const interaction = makeRevealButtonInteraction('check-1', [{ toJSON: () => ({}) }]);
      interaction.channel.send.mockRejectedValue(new Error('missing permissions'));

      await checkdc.button(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Failed to post publicly'),
        flags: MessageFlags.Ephemeral,
      });
      expect(interaction.update).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to post public check result'), expect.any(Error));
      errSpy.mockRestore();
    });
  });
});

describe('modal', () => {
  test('rejects a submission from someone other than the tagged player', async () => {
    const { checkId } = await startCheck();
    const interaction = makeModalInteraction(checkId, { id: 'someone-else' }, '1d20+5');

    await checkdc.modal(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining("isn't for you"), flags: MessageFlags.Ephemeral });
  });

  test('rejects a submission for a check that no longer exists', async () => {
    const interaction = makeModalInteraction('unknown-id', makePlayer('player-1'), '1d20+5');

    await checkdc.modal(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining('expired or was already resolved'), flags: MessageFlags.Ephemeral });
  });

  test('leaves the check pending and shows the specific reason after an invalid formula', async () => {
    const { checkId, player } = await startCheck();
    parseDice.mockImplementation(() => { throw new Error('Unsupported die: d3. Valid dice are d4, d6, d8, d10, d12, d20, d100.'); });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const badAttempt = makeModalInteraction(checkId, player, '1d3');

    await checkdc.modal(badAttempt);

    expect(badAttempt.reply).toHaveBeenCalledWith({
      content: '❌ Unsupported die: d3. Valid dice are d4, d6, d8, d10, d12, d20, d100. Click Roll again to retry.',
      flags: MessageFlags.Ephemeral,
    });
    expect(badAttempt.update).not.toHaveBeenCalled();
    // a rejected formula is expected user-input, not an operational bug — no full stack trace log
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported die: d3'));
    warnSpy.mockRestore();

    // the check must still be resolvable afterward
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    const goodAttempt = makeModalInteraction(checkId, player, '1d20+5');
    await checkdc.modal(goodAttempt);
    expect(goodAttempt.update).toHaveBeenCalled();
  });

  test('rolls, tells the player only that the check happened, and sends the GM the pass/fail result', async () => {
    const { gmInteraction, checkId, player } = await startCheck({ dc: 15, reason: 'Perception' });
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    const interaction = makeModalInteraction(checkId, player, '1d20+5');

    await checkdc.modal(interaction);

    expect(parseDice).toHaveBeenCalledWith('1d20+5');

    // player-facing update reveals nothing about the outcome, formula result, or DC
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('made their'),
      components: [],
    }));
    const playerFacingContent = interaction.update.mock.calls[0][0].content;
    expect(playerFacingContent).not.toContain('20'); // the roll total
    expect(playerFacingContent).not.toContain('15'); // the DC
    expect(playerFacingContent).not.toMatch(/pass|fail/i);

    // GM's ephemeral reply is updated with the real result, plus a button to reveal it
    expect(gmInteraction.editReply).toHaveBeenCalledTimes(1);
    const editReplyArgs = gmInteraction.editReply.mock.calls[0][0];
    const embed = editReplyArgs.embeds[0].toJSON();
    expect(embed.title).toContain('Passed');
    expect(embed.fields.find(f => f.name === 'Result').value).toBe('**20**');
    expect(embed.fields.find(f => f.name === 'DC').value).toBe('15');
    expect(embed.fields.find(f => f.name === 'Formula').value).toBe('`1d20+5`');
    expect(editReplyArgs.components).toHaveLength(1);
  });

  test('reports a failed check', async () => {
    const { gmInteraction, checkId, player } = await startCheck({ dc: 15 });
    parseDice.mockReturnValue({ total: 5, rolls: ['5'] });
    const interaction = makeModalInteraction(checkId, player, '1d20-3');

    await checkdc.modal(interaction);

    const embed = gmInteraction.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.title).toContain('Failed');
  });

  test('falls back to an ephemeral reply if the modal somehow was not opened from the message component', async () => {
    const { checkId, player } = await startCheck();
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    const interaction = makeModalInteraction(checkId, player, '1d20+5', { fromMessage: false });

    await checkdc.modal(interaction);

    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining('Roll submitted'), flags: MessageFlags.Ephemeral });
  });

  test('treats a check as expired past the ~15-minute ephemeral edit window instead of trying and failing to notify the GM', async () => {
    const realNow = Date.now;
    Date.now = jest.fn(() => realNow());
    const { gmInteraction, checkId, player } = await startCheck();
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    Date.now = jest.fn(() => realNow() + 15 * 60 * 1000);
    const interaction = makeModalInteraction(checkId, player, '1d20+5');

    await checkdc.modal(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining('expired'), flags: MessageFlags.Ephemeral });
    expect(interaction.update).not.toHaveBeenCalled();
    expect(gmInteraction.editReply).not.toHaveBeenCalled();
    Date.now = realNow;
  });

  test('cannot be resolved twice', async () => {
    const { checkId, player } = await startCheck();
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    const first = makeModalInteraction(checkId, player, '1d20+5');
    const second = makeModalInteraction(checkId, player, '1d20+5');

    await checkdc.modal(first);
    await checkdc.modal(second);

    expect(second.reply).toHaveBeenCalledWith({ content: expect.stringContaining('expired or was already resolved'), flags: MessageFlags.Ephemeral });
    expect(second.update).not.toHaveBeenCalled();
  });

  test('logs and does not throw if delivering the result to the GM fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { gmInteraction, checkId, player } = await startCheck();
    parseDice.mockReturnValue({ total: 20, rolls: ['15'] });
    gmInteraction.editReply.mockRejectedValue(new Error('token expired'));
    const interaction = makeModalInteraction(checkId, player, '1d20+5');

    await expect(checkdc.modal(interaction)).resolves.not.toThrow();

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to deliver check result'), expect.any(Error));
    errSpy.mockRestore();
  });
});
