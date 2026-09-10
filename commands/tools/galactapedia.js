const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ComponentType,
    MessageFlags
  } = require('discord.js');
  const { Op } = require('sequelize');
  const {
    GalactapediaEntry,
    GalactapediaDetail,
    GalactapediaCategory,
    GalactapediaTag,
    GalactapediaProperty,
    GalactapediaRelated,
    GalactapediaRelatedArticle
  } = require('../../config/database');
  const { fetchSCDataByUrl } = require('../../utils/fetchSCData');
  const { isUserVerified } = require('../../utils/verifyGuard');
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('galactapedia')
      .setDescription('Search for a Galactapedia entry')
      .addStringOption(option =>
        option.setName('query')
          .setDescription('Search term (name or partial match)')
          .setRequired(true)
      ),
      help: 'Search and display Galactapedia entries with full descriptions and related content.',
      category: 'Star Citizen',
  
    async execute(interaction) {

      if (!(await isUserVerified(interaction.user.id))) {
        return interaction.reply({
          content: '❌ You must verify your RSI profile using `/verify` before using this command.',
          flags: MessageFlags.Ephemeral
        });
      }
      
      const query = interaction.options.getString('query');
      await interaction.deferReply();
  
      let entry = await GalactapediaEntry.findOne({
        where: {
          [Op.or]: [
            { id: query },
            { slug: query },
            { title: query }
          ]
        }
      });
  
      if (!entry) {
        const matches = await GalactapediaEntry.findAll({
          where: {
            title: {
              [Op.like]: `%${query}%`
            }
          },
          limit: 25
        });
  
        if (!matches.length) {
          return interaction.editReply(`❌ No Galactapedia entries found for "${query}".`);
        }
  
        const select = new StringSelectMenuBuilder()
          .setCustomId('galactapedia_select')
          .setPlaceholder('Select an entry')
          .addOptions(matches.map(match => ({
            label: match.title.slice(0, 100),
            description: match.slug,
            value: match.id
          })));
  
        const row = new ActionRowBuilder().addComponents(select);
  
        await interaction.editReply({
          content: 'Multiple entries found. Please choose one:',
          components: [row]
        });
  
        try {
          const selected = await interaction.channel.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 15000
          });
  
          await selected.deferUpdate();
          entry = await GalactapediaEntry.findByPk(selected.values[0]);
        } catch (err) {
          console.error('[GALACTAPEDIA] Selection error:', err);
          return interaction.editReply({ content: '❌ Selection timed out.', components: [] });
        }
      }
  
      let detail = await GalactapediaDetail.findByPk(entry.id);
      if (!detail) {
        try {
          const response = await fetchSCDataByUrl(entry.api_url);
          const data = response.data;
  
          const content = data.translations?.en_EN?.trim()?.slice(0, 4000) || 'No content found.';
  
          await GalactapediaDetail.upsert({
            entry_id: entry.id,
            content,
            updated_at: new Date()
          });
  
          // Related tables
          await GalactapediaCategory.destroy({ where: { entry_id: entry.id } });
          await GalactapediaTag.destroy({ where: { entry_id: entry.id } });
          await GalactapediaProperty.destroy({ where: { entry_id: entry.id } });
          await GalactapediaRelatedArticle.destroy({ where: { entry_id: entry.id } });
  
          for (const cat of data.categories || []) {
            await GalactapediaCategory.upsert({
              entry_id: entry.id,
              category_id: cat.id,
              category_name: cat.name
            });
          }
  
          for (const tag of data.tags || []) {
            await GalactapediaTag.upsert({
              entry_id: entry.id,
              tag_id: tag.id,
              tag_name: tag.name
            });
          }
  
          for (const prop of data.properties || []) {
            await GalactapediaProperty.create({
              entry_id: entry.id,
              name: prop.name,
              value: prop.value
            });
          }
  
          for (const rel of data.related_articles || []) {
            await GalactapediaRelatedArticle.upsert({
              entry_id: entry.id,
              related_id: rel.id,
              title: rel.title,
              url: rel.url,
              api_url: rel.api_url
            });
          }
  
          detail = await GalactapediaDetail.findByPk(entry.id);
        } catch (err) {
          console.error('[GALACTAPEDIA] Failed to fetch detail:', err);
          return interaction.editReply('❌ Failed to fetch Galactapedia detail.');
        }
      }
  
      const embed = {
        color: 0x3399ff,
        title: entry.title,
        url: entry.rsi_url,
        description: detail.content || 'No description available.',
        thumbnail: entry.thumbnail ? { url: entry.thumbnail } : undefined,
        footer: {
          text: entry.type || 'Entry',
        },
        timestamp: new Date().toISOString()
      };
  
      await interaction.editReply({ embeds: [embed], components: [] });
    }
  };
  