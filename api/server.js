const express = require('express');
const cors = require('cors');
const { router: contentRouter } = require('./content');
const { router: eventsRouter } = require('./events');
const { router: accoladesRouter } = require('./accolades');
const { router: docsRouter } = require('./docs');
const { router: loginRouter } = require("./login");

const { router: profileRouter } = require('./profile');
const { router: activityLogRouter } = require('./activityLog');
const { router: membersRouter } = require('./members');
const { router: officersRouter } = require('./officers');
const { router: orgsRouter } = require('./orgs');
const { router: commandsRouter } = require('./commands');
const { router: scChangelogRouter } = require('./scChangelog');
const { authMiddleware } = require('./auth');

function createApp() {
  const app = express();
  app.use(cors());

  app.use('/api/login', loginRouter);
  app.use('/api/docs', docsRouter);

  // Public endpoints
  app.use('/api/accolades', accoladesRouter);
  app.use('/api/content', contentRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/orgs', orgsRouter);
  app.use('/api/officers', officersRouter);
  app.use('/api/sc-changelog', scChangelogRouter);
  app.get('/api/data', async (req, res) => {
    res.json({ success: true, message: 'API is working' });
  });

  // Protected endpoints
  app.use('/api', authMiddleware);
  app.use('/api/profile', profileRouter);
  app.use('/api', commandsRouter);
  app.use('/api/activity-log', activityLogRouter);
  app.use('/api/members', membersRouter);

  return app;
}

function startApi() {
  const port = process.env.API_PORT || 8003;
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`\uD83C\uDF10 API server running on port ${port}`); // 🌐
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`\u26A0\uFE0F API server port ${port} already in use`); // ⚠️
    } else {
      console.error('❌ API server error:', err);
    }
  });

  return server;
}

module.exports = { createApp, startApi };
