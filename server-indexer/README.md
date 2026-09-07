# LitVM DEX Server Indexer

This is a standalone, real-time background indexer for the LitVM DEX. It listens to trade contract events using `viem` WebSockets (or HTTP polling) and stores them directly in your MongoDB database.

---

## 🚀 How to Deploy on Railway.com

Railway allows you to run this project 24/7 as a background worker.

### Step 1: Create a GitHub Repository
1. Initialize a new Git repository in this folder (`server-indexer`):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create a new repository on GitHub (e.g. `litvm-dex-indexer`).
3. Add the remote origin and push:
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/litvm-dex-indexer.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Railway
1. Log in to [Railway.com](https://railway.com).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your `litvm-dex-indexer` repository.
4. Click **Deploy Now**.

### Step 3: Configure Environment Variables
In your Railway project dashboard, navigate to **Settings -> Variables** and add the following:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `MONGODB_URI` | Your MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/dex_tracker` |
| `NEXT_PUBLIC_LITVM_RPC_URL` | The HTTP RPC endpoint for LitVM | `https://liteforge.rpc.caldera.xyz/infra-partner-http` |
| `LITVM_WS_RPC_URL` | *(Optional)* The WebSocket RPC endpoint | `wss://liteforge.rpc.caldera.xyz/infra-partner-ws` |

Railway will automatically build, deploy, and keep the indexer running 24/7.
