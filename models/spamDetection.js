const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('SpamDetection', {
    user_id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false
    },
    account_created_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    first_message_content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    flags: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false
    },
    message_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    last_message_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    action_taken: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'none, deleted, banned'
    },
    ban_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    false_positive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  }, {
    tableName: 'spam_detection',
    timestamps: true
  });
};
