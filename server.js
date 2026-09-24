// server.js — entry point for Hostinger Node.js hosting, a VPS, or local dev.
// (On Vercel, api/index.js is used instead — same app, no listen().)
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Radiant Health Alliance server running on port ${PORT}`);
});
