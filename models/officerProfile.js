const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('OfficerProfile', {
    user_id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    role_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    role_color: {
      type: DataTypes.STRING,
      allowNull: true
    },
    synced_at: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'officer_profiles',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false
  });
};
