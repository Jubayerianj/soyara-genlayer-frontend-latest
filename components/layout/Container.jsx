import { motion } from 'framer-motion'

export default function Container({ 
  children, 
  className = '',
  maxWidth = 'max-w-7xl',
  padding = 'px-4 sm:px-6 lg:px-8',
  animate = true
}) {
  const content = (
    <div className={`${padding} mx-auto ${maxWidth}`}>
      <div className={className}>
        {children}
      </div>
    </div>
  )

  if (!animate) {
    return content
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {content}
    </motion.div>
  )
}

// Variants for different container types
export const SectionContainer = ({ children, className = '' }) => (
  <Container className={`py-12 ${className}`}>
    {children}
  </Container>
)

export const PageContainer = ({ children, className = '' }) => (
  <Container className={`py-8 ${className}`} maxWidth="max-w-6xl">
    {children}
  </Container>
)

export const CardContainer = ({ children, className = '' }) => (
  <div className={`bg-gradient-to-br from-gray-900 to-black rounded-2xl border border-gray-800 ${className}`}>
    {children}
  </div>
)