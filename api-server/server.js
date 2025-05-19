require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Mongo setup ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err.message));

// Schema & Model
const cryptoStatSchema = new mongoose.Schema({
  coinId:     { type: String, required: true },
  priceUsd:   { type: Number, required: true },
  marketCapUsd: { type: Number, required: true },
  change24hPct: { type: Number, required: true },
  fetchedAt:  { type: Date,   default: Date.now }
});
const CryptoStat = mongoose.model('CryptoStat', cryptoStatSchema);

// --- CoinGecko fetcher ---
async function storeCryptoStats() {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets';
    const response = await axios.get(url, {
      params: {
        vs_currency: 'usd',
        ids: ['bitcoin','ethereum','matic-network'].join(','),
      }
    });

    const docs = response.data.map(c => ({
      coinId:        c.id,
      priceUsd:      c.current_price,
      marketCapUsd:  c.market_cap,
      change24hPct:  c.price_change_percentage_24h,
      fetchedAt:     new Date()
    }));

    await CryptoStat.insertMany(docs);
    console.log('Stats stored:', docs.map(d => d.coinId).join(', '));
  } catch (err) {
    console.error('Fetch/store error:', err.message);
  }
}

// --- Redis subscriber (Task 4) ---
const subscriber = createClient({ url: process.env.REDIS_URL });
subscriber.connect()
  .then(() => console.log('Redis subscriber connected'))
  .catch(err => console.error('Redis error:', err));

subscriber.subscribe('crypto_update', async (msg) => {
  try {
    const { trigger } = JSON.parse(msg);
    if (trigger === 'update') {
      console.log('Received update event, storing stats...');
      await storeCryptoStats();
    }
  } catch (err) {
    console.error('Error handling message:', err.message);
  }
});

// --- Routes ---

// 1) Manual trigger
app.get('/store-crypto-stats', async (req, res) => {
  await storeCryptoStats();
  res.json({ message: 'Stats fetched and stored.' });
});

// 2) /stats → latest for coin
app.get('/stats', async (req, res) => {
  const coin = req.query.coin;
  if (!coin) return res.status(400).json({ error: 'Missing coin parameter' });

  const stat = await CryptoStat.findOne({ coinId: coin })
    .sort({ fetchedAt: -1 });
  if (!stat) return res.status(404).json({ error: `No data for ${coin}` });

  res.json({
    price:     stat.priceUsd,
    marketCap: stat.marketCapUsd,
    '24hChange': stat.change24hPct
  });
});

// 3) /deviation → std dev over last 100 records
app.get('/deviation', async (req, res) => {
  const coin = req.query.coin;
  if (!coin) return res.status(400).json({ error: 'Missing coin parameter' });

  const recs = await CryptoStat.find({ coinId: coin })
    .sort({ fetchedAt: -1 })
    .limit(100);

  if (!recs.length) return res.status(404).json({ error: `No records for ${coin}` });

  const prices = recs.map(r => r.priceUsd);
  const n = prices.length;
  const mean = prices.reduce((sum, p) => sum + p, 0) / n;
  const variance = prices.reduce((sum, p) => sum + (p - mean)**2, 0) / n;
  const deviation = Math.sqrt(variance);

  res.json({ deviation: parseFloat(deviation.toFixed(2)) });
});

// --- Start server ---
app.listen(PORT, () => console.log(`api-server listening on port ${PORT}`));
