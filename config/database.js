const { Sequelize } = require('sequelize');
const config = require('../databaseConfig.json');  // Adjust the path if needed

const env = process.env.BOT_TYPE || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging || false,
});

// Import models after initializing sequelize
const UsageLog = require('../models/usageLog')(sequelize);
const VoiceLog = require('../models/voiceLog')(sequelize);
const SnapChannel = require('../models/snapChannels')(sequelize);
const Event = require('../models/eventsModel')(sequelize);
const Config = require('../models/config')(sequelize);
const ScheduledAnnouncement = require('../models/scheduledAnnouncement')(sequelize);
const Manufacturer = require('../models/manufacturer')(sequelize);
const Vehicle = require('../models/vehicle')(sequelize);
const VehicleDetail = require('../models/vehicleDetail')(sequelize);
const GalactapediaEntry = require('../models/galactapediaEntry')(sequelize);
const GalactapediaDetail = require('../models/galactapediaDetail')(sequelize);
const GalactapediaProperty = require('../models/galactapediaProperty')(sequelize);
const GalactapediaRelatedArticle = require('../models/galactapediaRelatedArticle')(sequelize);
const GalactapediaTag = require('../models/galactapediaTag')(sequelize);
const GalactapediaCategory = require('../models/galactapediaCategory')(sequelize);
const UexVehicle = require('../models/uexVehicle')(sequelize);
const UexTerminal = require('../models/uexTerminal')(sequelize);
const UexItemPrice = require('../models/uexItemPrice')(sequelize);
const UexCategory = require('../models/uexCategory')(sequelize);
const UexCommodityPrice = require('../models/uexCommodityPrice')(sequelize);
const UexFuelPrice = require('../models/uexFuelPrice')(sequelize);
const UexVehiclePurchasePrice = require('../models/uexVehiclePurchasePrice')(sequelize);
const UexVehicleRentalPrice = require('../models/uexVehicleRentalPrice')(sequelize);
const UexPoi = require('../models/uexPoi')(sequelize);
const Accolade = require('../models/accolade')(sequelize);
const AccoladeRecipient = require('../models/accoladeRecipient')(sequelize);
const OrgTag = require('../models/orgTag')(sequelize);
const Org = require('../models/org')(sequelize);
const VerificationCode = require('../models/verificationCode')(sequelize);
const VerifiedUser = require('../models/verifiedUser')(sequelize);
const OfficerBio = require('../models/officerBio')(sequelize);
const OfficerProfile = require('../models/officerProfile')(sequelize);
const AmbientMessage = require('../models/ambiEntMessage')(sequelize);
const AmbientChannel = require('../models/ambientChannel')(sequelize);
const AmbientSetting = require('../models/ambientSetting')(sequelize);
const SiteContent = require('../models/siteContent')(sequelize);
const Hunt = require('../models/hunt')(sequelize);
const HuntPoi = require('../models/huntPoi')(sequelize);
const HuntSubmission = require('../models/huntSubmission')(sequelize);

Object.values(sequelize.models).forEach(model => {
    if (typeof model.associate === 'function') {
        model.associate(sequelize.models);
    }
});

const initializeDatabase = async () => {
    try {
        console.log('🧩 Starting database synchronization...');

        for (const [modelName, model] of Object.entries(sequelize.models)) {
            try {
                await model.sync({ alter: false }); // Change to force: true or alter: true if needed
            } catch (modelError) {
                console.error(`❌ Failed to sync model: ${modelName}`, modelError);
            }
        }

        console.log('✅ All models synchronized');
    } catch (error) {
        console.error('❌ Unable to synchronize the database:', error);
    }
};

module.exports = {
    sequelize,
    initializeDatabase,
    UsageLog,
    VoiceLog,
    SnapChannel,
    Event,
    Config,
    ScheduledAnnouncement,
    Manufacturer,
    Vehicle,
    VehicleDetail,
    GalactapediaEntry,
    GalactapediaDetail,
    GalactapediaProperty,
    GalactapediaRelatedArticle,
    GalactapediaTag,
    GalactapediaCategory,
    UexVehicle,
    UexTerminal,
    UexItemPrice,
    UexCategory,
    UexCommodityPrice,
    UexFuelPrice,
    UexVehiclePurchasePrice,
    UexVehicleRentalPrice,
    UexPoi,
    Accolade,
    AccoladeRecipient,
    OrgTag,
    Org,
    VerificationCode,
    VerifiedUser,
    OfficerBio,
    OfficerProfile,
    AmbientMessage,
    AmbientChannel,
    AmbientSetting,
    SiteContent,
    Hunt,
    HuntPoi,
    HuntSubmission
};
