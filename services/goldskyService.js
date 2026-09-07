// services/goldskyService.js

const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmrgg88kjt8sw01wxhc9476jr/subgraphs/flipswap-v2/1.0.3/gn';

export class GoldskyService {
  async fetchTokenStats(tokenAddress) {
    const query = `
      query TokenStats($id: ID!) {
        token(id: $id) {
          id
          symbol
          name
          tradeVolumeUSD
          totalValueLockedUSD
        }
      }
    `;

    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { id: tokenAddress.toLowerCase() },
        }),
      });

      const result = await response.json();
      if (result.errors) {
        console.warn('Subgraph query errors:', result.errors);
        return null;
      }

      return result.data?.token || null;
    } catch (error) {
      console.error('Failed to fetch subgraph data:', error);
      return null;
    }
  }

  async fetchMultipleTokenStats(tokenAddresses) {
    const query = `
      query MultipleTokenStats($ids: [ID!]!) {
        tokens(where: { id_in: $ids }) {
          id
          symbol
          name
          tradeVolumeUSD
          totalValueLockedUSD
        }
      }
    `;

    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { ids: tokenAddresses.map(a => a.toLowerCase()) },
        }),
      });

      const result = await response.json();
      if (result.errors) {
        console.warn('Subgraph query errors:', result.errors);
        return {};
      }

      const statsMap = {};
      result.data?.tokens?.forEach(token => {
        statsMap[token.id.toLowerCase()] = {
          volume24h: parseFloat(token.tradeVolumeUSD || 0),
          tvl: parseFloat(token.totalValueLockedUSD || 0),
          marketCap: 0 // Subgraph usually doesn't have market cap directly
        };
      });

      return statsMap;
    } catch (error) {
      console.error('Failed to fetch multiple subgraph data:', error);
      return {};
    }
  }
}

export const goldskyService = new GoldskyService();
