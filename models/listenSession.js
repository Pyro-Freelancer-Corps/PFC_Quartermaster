const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ListenSession', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    server_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    voice_channel_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    text_channel_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    started_by_user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stopped_by_user_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    end_reason: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'ListenSessions',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false
  });
};
