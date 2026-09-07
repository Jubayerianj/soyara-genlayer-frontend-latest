// components/SimpleBridgeWidget.jsx
'use client'
import dynamic from 'next/dynamic'

const LiFiWidget = dynamic(
  () => import('@lifi/widget').then((mod) => mod.LiFiWidget),
  {
    ssr: false,
    loading: () => (
      <div style={{ 
        padding: '60px 20px', 
        textAlign: 'center', 
        background: '#f9f9f9',
        borderRadius: '12px',
        color: '#666'
      }}>
        Loading Bridge Interface...
      </div>
    )
  }
)

export default function SimpleBridgeWidget() {
  return (
    <LiFiWidget 
      integrator={process.env.NEXT_PUBLIC_INTEGRATOR || 'liquidfi'}
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
  )
}