// models/scChangelogEntry.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ScChangelogEntry = sequelize.define('ScChangelogEntry', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    versionFrom: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    versionTo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    recordRef: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    recordName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Real player-facing name resolved from the game's localization table
    // (e.g. "Drake Cutlass Black"), where the game actually has one assigned
    // — many records only have an unassigned-localization placeholder, so
    // this is null for those rather than falling back to recordName.
    recordDisplayName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recordType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fieldKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    oldValue: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // SHA-256 hex of `${versionFrom}|${versionTo}|${recordRef}|${fieldKey}`,
    // computed by the ingestion script. A single fixed-length hashed column
    // keeps the unique index well under MySQL's composite-index byte limit
    // (four separate VARCHAR(255) utf8mb4 columns would blow past it).
    dedupeKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
  }, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  });

  return ScChangelogEntry;
};
