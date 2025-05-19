# 🔁 Crypto Worker Server

This server runs in the background and publishes update events to Redis every 15 minutes to trigger the API server.

---

## 🧩 Tech Stack

- Node.js
- Redis Pub/Sub
- node-cron

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install

### 2. Required services

redis-server.exe

### 3. Run the server

npm start