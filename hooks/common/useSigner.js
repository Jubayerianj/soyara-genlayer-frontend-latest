
// hooks/common/useSigner.js

import { useWalletClient } from 'wagmi'

import { ethers } from 'ethers'
import { useMemo } from 'react'

export function useSigner() {
  const { data: walletClient } = useWalletClient()
  
  const signer = useMemo(() => {
    if (!walletClient) return null
    
    try {
      // Convert viem wallet client to ethers signer
      const { account, chain, transport } = walletClient
      
      // Create provider with ethers
      const provider = new ethers.BrowserProvider(transport, {
        chainId: chain.id,
        name: chain.name,
        ensAddress: chain.contracts?.ensRegistry?.address,
      })
      
      return provider.getSigner(account.address)
    } catch (error) {
      console.error('Error creating signer from wallet client:', error)
      return null
    }
  }, [walletClient])
  
  return { data: signer }
}