
// components/LiFiWidgetIsolated.jsx

'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// This component completely isolates LiFi widget with its own dependencies
const LiFiWidget = dynamic(
  () => {
    // Import LiFi widget in a completely isolated way
    return import('@lifi/widget').then(module => {
      const Widget = module.LiFiWidget
      
      return function IsolatedLiFiWidget({ integrator }) {
        const [isClient, setIsClient] = useState(false)
        
        useEffect(() => {
          setIsClient(true)
        }, [])
        
        if (!isClient) {
          return (
            <div style={{ 
              padding: '60px 20px', 
              textAlign: 'center', 
              background: '#f9f9f9',
              borderRadius: '8px',
              color: '#666'
            }}>
              Loading Bridge Interface...
            </div>
          )
        }
        
        return (
          <div style={{ 
            borderRadius: '12px',
            overflow: 'hidden',
            isolation: 'isolate' // This creates a new stacking context
          }}>
            <Widget
              integrator={integrator}
              config={{
                variant: "drawer",
                theme: {
                  palette: {
                    primary: { main: '#764ba2' },
                    secondary: { main: '#667eea' },
                  },
                },
              }}
            />
          </div>
        )
      }
    })
  },
  {
    ssr: false,
    loading: () => (
      <div style={{ 
        padding: '40px 20px', 
        textAlign: 'center', 
        background: '#f5f5f5',
        borderRadius: '8px'
      }}>
        Initializing Bridge...
      </div>
    )
  }
)

export default LiFiWidget