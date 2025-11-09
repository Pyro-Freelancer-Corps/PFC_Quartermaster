const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('AccoladeRecipient', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    accolade_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Accolades',
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
    display_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    synced_at: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'accolade_recipients',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['accolade_id'] },
      { fields: ['user_id'] }
    ]
  });
};
