const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ListenUtterance', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    session_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ListenSessions',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    spoken_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'listen_utterances',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['user_id'] }
    ]
  });
};
