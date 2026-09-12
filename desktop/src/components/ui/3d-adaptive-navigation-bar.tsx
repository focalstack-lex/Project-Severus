import React, { useState, useRef, useEffect } from 'react'
import { motion, useSpring, AnimatePresence } from 'framer-motion'

export interface NavItem {
  label: string
  id: string
}

export interface PillBaseProps {
  items?: NavItem[]
  activeId?: string
  onChange?: (id: string) => void
  theme?: 'light' | 'dark'
}

/**
 * 3D Adaptive Navigation Pill
 * Smart navigation with scroll detection and hover expansion
 */
export const PillBase: React.FC<PillBaseProps> = ({
  items: propItems,
  activeId: propActiveId,
  onChange,
  theme = 'light',
}) => {
  const defaultItems: NavItem[] = [
    { label: 'Home', id: 'home' },
    { label: 'Problem', id: 'problem' },
    { label: 'Solution', id: 'solution' },
    { label: 'Contact', id: 'contact' },
  ]

  const navItems = propItems && propItems.length > 0 ? propItems : defaultItems
  const [internalActiveSection, setInternalActiveSection] = useState(navItems[0]?.id || 'home')
  const activeSection = propActiveId !== undefined ? propActiveId : internalActiveSection

  const [expanded, setExpanded] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSectionRef = useRef(activeSection)

  // Spring animations for smooth, immediate motion
  const pillWidth = useSpring(140, { stiffness: 460, damping: 28, mass: 0.7 })
  const pillShift = useSpring(0, { stiffness: 460, damping: 28, mass: 0.7 })

  // Calculate expanded width dynamically based on items count
  const targetExpandedWidth = Math.max(480, navItems.length * 130)

  // Handle hover expansion
  useEffect(() => {
    if (hovering) {
      setExpanded(true)
      pillWidth.set(targetExpandedWidth)
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    } else {
      hoverTimeoutRef.current = setTimeout(() => {
        setExpanded(false)
        pillWidth.set(140)
      }, 350)
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [hovering, pillWidth, targetExpandedWidth])

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHovering(true)
    setExpanded(true)
    pillWidth.set(targetExpandedWidth)
  }

  const handleMouseLeave = () => {
    setHovering(false)
  }

  const handleSectionClick = (sectionId: string) => {
    // Trigger transition state
    setIsTransitioning(true)
    prevSectionRef.current = sectionId
    setInternalActiveSection(sectionId)
    onChange?.(sectionId)
    
    // Collapse the pill after selection
    setHovering(false)
    
    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false)
    }, 400)
  }

  const activeItem = navItems.find(item => item.id === activeSection) || navItems[0]
  const isDark = theme === 'dark'

  return (
    <motion.nav
      data-tauri-drag-region
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative rounded-full select-none cursor-grab active:cursor-grabbing"
      style={{
        width: pillWidth,
        height: '56px',
        background: isDark
          ? `
            linear-gradient(135deg, 
              #1c1c1f 0%, 
              #17171a 15%, 
              #121214 30%, 
              #0f0f12 45%, 
              #0b0b0d 60%, 
              #070709 75%, 
              #050506 90%, 
              #08080a 100%
            )
          `
          : `
            linear-gradient(135deg, 
              #fcfcfd 0%, 
              #f8f8fa 15%, 
              #f3f4f6 30%, 
              #eeeff2 45%, 
              #e9eaed 60%, 
              #e4e5e8 75%, 
              #dee0e3 90%, 
              #e2e3e6 100%
            )
          `,
        boxShadow: expanded
          ? (isDark 
              ? `
                0 4px 14px rgba(0, 0, 0, 0.28),
                0 1px 3px rgba(0, 0, 0, 0.20),
                inset 0 1px 1px rgba(255, 255, 255, 0.12),
                inset 0 -1px 2px rgba(0, 0, 0, 0.40)
              `
              : `
                0 4px 14px rgba(0, 0, 0, 0.08),
                0 1px 3px rgba(0, 0, 0, 0.04),
                inset 0 1px 1px rgba(255, 255, 255, 0.8),
                inset 0 -1px 2px rgba(0, 0, 0, 0.06)
              `)
          : isTransitioning
          ? (isDark
              ? `
                0 3px 10px rgba(0, 0, 0, 0.25),
                0 1px 2px rgba(0, 0, 0, 0.15),
                inset 0 1px 1px rgba(255, 255, 255, 0.10),
                inset 0 0 10px rgba(99, 102, 241, 0.12)
              `
              : `
                0 3px 10px rgba(0, 0, 0, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.03),
                inset 0 1px 1px rgba(255, 255, 255, 0.8),
                inset 0 -1px 2px rgba(0, 0, 0, 0.05)
              `)
          : (isDark
              ? `
                0 3px 10px rgba(0, 0, 0, 0.25),
                0 1px 2px rgba(0, 0, 0, 0.15),
                inset 0 1px 1px rgba(255, 255, 255, 0.10),
                inset 0 -1px 2px rgba(0, 0, 0, 0.40)
              `
              : `
                0 3px 10px rgba(0, 0, 0, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.03),
                inset 0 1px 1px rgba(255, 255, 255, 0.7),
                inset 0 -1px 2px rgba(0, 0, 0, 0.05)
              `),
        x: pillShift,
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease-out',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Primary top edge ridge - ultra bright */}
      <div 
        className="absolute inset-x-0 top-0 rounded-t-full pointer-events-none"
        style={{
          height: '2px',
          background: isDark
            ? 'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.25) 15%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0.25) 85%, rgba(255, 255, 255, 0) 100%)'
            : 'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.95) 5%, rgba(255, 255, 255, 1) 15%, rgba(255, 255, 255, 1) 85%, rgba(255, 255, 255, 0.95) 95%, rgba(255, 255, 255, 0) 100%)',
          filter: 'blur(0.3px)',
        }}
      />
      
      {/* Top hemisphere light catch */}
      <div 
        className="absolute inset-x-0 top-0 rounded-full pointer-events-none"
        style={{
          height: '55%',
          background: isDark
            ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 40%, rgba(255, 255, 255, 0) 100%)'
            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.25) 30%, rgba(255, 255, 255, 0.10) 60%, rgba(255, 255, 255, 0) 100%)',
        }}
      />
      
      {/* Directional light - top left */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 25%, transparent 50%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.40) 0%, rgba(255, 255, 255, 0.20) 20%, rgba(255, 255, 255, 0.08) 40%, rgba(255, 255, 255, 0) 65%)',
        }}
      />
      
      {/* Premium gloss reflection - main */}
      <div 
        className="absolute rounded-full pointer-events-none"
        style={{
          left: expanded ? '18%' : '15%',
          top: '16%',
          width: expanded ? '140px' : '60px',
          height: '14px',
          background: isDark
            ? 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 40%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.70) 0%, rgba(255, 255, 255, 0.35) 40%, rgba(255, 255, 255, 0.10) 70%, rgba(255, 255, 255, 0) 100%)',
          filter: 'blur(4px)',
          transform: 'rotate(-12deg)',
          transition: 'all 0.3s ease',
        }}
      />
      
      {/* Secondary gloss accent - only show when expanded */}
      {expanded && (
        <div 
          className="absolute rounded-full pointer-events-none"
          style={{
            right: '22%',
            top: '20%',
            width: '80px',
            height: '10px',
            background: isDark
              ? 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.03) 60%, transparent 100%)'
              : 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.50) 0%, rgba(255, 255, 255, 0.15) 60%, rgba(255, 255, 255, 0) 100%)',
            filter: 'blur(3px)',
            transform: 'rotate(8deg)',
          }}
        />
      )}
      
      {/* Left edge illumination - only show when expanded */}
      {expanded && (
        <div 
          className="absolute inset-y-0 left-0 rounded-l-full pointer-events-none"
          style={{
            width: '35%',
            background: isDark
              ? 'linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 40%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.10) 40%, rgba(255, 255, 255, 0.03) 70%, rgba(255, 255, 255, 0) 100%)',
          }}
        />
      )}
      
      {/* Right edge shadow - only show when expanded */}
      {expanded && (
        <div 
          className="absolute inset-y-0 right-0 rounded-r-full pointer-events-none"
          style={{
            width: '35%',
            background: 'linear-gradient(270deg, rgba(0, 0, 0, 0.18) 0%, rgba(0, 0, 0, 0.08) 40%, transparent 100%)',
          }}
        />
      )}
      
      {/* Bottom curvature - deep shadow */}
      <div 
        className="absolute inset-x-0 bottom-0 rounded-b-full pointer-events-none"
        style={{
          height: '40%',
          background: isDark
            ? 'linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.05) 50%, transparent 100%)'
            : 'linear-gradient(0deg, rgba(0, 0, 0, 0.10) 0%, rgba(0, 0, 0, 0.04) 50%, transparent 100%)',
        }}
      />

      {/* Bottom edge contact shadow */}
      <div 
        className="absolute inset-x-0 bottom-0 rounded-b-full pointer-events-none"
        style={{
          height: '15%',
          background: isDark
            ? 'linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0%, transparent 100%)'
            : 'linear-gradient(0deg, rgba(0, 0, 0, 0.12) 0%, transparent 100%)',
          filter: 'blur(1px)',
        }}
      />

      {/* Inner diffuse glow */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: isDark ? 'inset 0 0 20px rgba(255, 255, 255, 0.05)' : 'inset 0 0 40px rgba(255, 255, 255, 0.22)',
          opacity: 0.7,
        }}
      />
      
      {/* Micro edge definition */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: isDark ? 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.1)' : 'inset 0 0 0 0.5px rgba(0, 0, 0, 0.10)',
        }}
      />

      {/* Navigation items container */}
      <div 
        ref={containerRef}
        className="relative z-10 h-full flex items-center justify-center px-6"
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro", Poppins, sans-serif',
        }}
      >
        {/* Collapsed state - show only active section with smooth text transitions */}
        {!expanded && (
          <div className="flex items-center relative">
            <AnimatePresence mode="wait">
              {activeItem && (
                <motion.span
                  key={activeItem.id}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{
                    duration: 0.35,
                    ease: [0.4, 0.0, 0.2, 1]
                  }}
                  style={{
                    fontSize: '15.5px',
                    fontWeight: 680,
                    color: isDark ? '#f4f4f5' : '#1a1a1a',
                    letterSpacing: '0.45px',
                    whiteSpace: 'nowrap',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", Poppins, sans-serif',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textShadow: isDark
                      ? '0 1px 2px rgba(0, 0, 0, 0.8)'
                      : `
                        0 1px 0 rgba(0, 0, 0, 0.35),
                        0 -1px 0 rgba(255, 255, 255, 0.8),
                        1px 1px 0 rgba(0, 0, 0, 0.18),
                        -1px 1px 0 rgba(0, 0, 0, 0.15)
                      `,
                  }}
                >
                  {activeItem.label}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Expanded state - show all sections with stagger */}
        {expanded && (
          <div className="flex items-center justify-evenly w-full">
            {navItems.map((item, index) => {
              const isActive = item.id === activeSection
              
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ 
                    delay: index * 0.08,
                    duration: 0.25,
                    ease: 'easeOut'
                  }}
                  onClick={() => handleSectionClick(item.id)}
                  className="relative cursor-pointer transition-all duration-200"
                  style={{
                    fontSize: isActive ? '15.5px' : '15px',
                    fontWeight: isActive ? 680 : 510,
                    color: isActive 
                      ? (isDark ? '#ffffff' : '#1a1a1a') 
                      : (isDark ? '#888892' : '#656565'),
                    textDecoration: 'none',
                    letterSpacing: '0.45px',
                    background: 'transparent',
                    border: 'none',
                    padding: '10px 16px',
                    outline: 'none',
                    whiteSpace: 'nowrap',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", Poppins, sans-serif',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    transform: isActive ? 'translateY(-1.5px)' : 'translateY(0)',
                    textShadow: isActive 
                      ? (isDark 
                          ? '0 1px 3px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)'
                          : `
                            0 1px 0 rgba(0, 0, 0, 0.35),
                            0 -1px 0 rgba(255, 255, 255, 0.8),
                            1px 1px 0 rgba(0, 0, 0, 0.18),
                            -1px 1px 0 rgba(0, 0, 0, 0.15)
                          `)
                      : (isDark
                          ? '0 1px 2px rgba(0, 0, 0, 0.6)'
                          : `
                            0 1px 0 rgba(0, 0, 0, 0.22),
                            0 -1px 0 rgba(255, 255, 255, 0.65),
                            1px 1px 0 rgba(0, 0, 0, 0.12),
                            -1px 1px 0 rgba(0, 0, 0, 0.10)
                          `),
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = isDark ? '#d4d4d8' : '#3a3a3a'
                      e.currentTarget.style.transform = 'translateY(-0.5px)'
                      e.currentTarget.style.textShadow = isDark
                        ? '0 1px 2px rgba(0,0,0,0.8)'
                        : `
                          0 1px 0 rgba(0, 0, 0, 0.28),
                          0 -1px 0 rgba(255, 255, 255, 0.72),
                          1px 1px 0 rgba(0, 0, 0, 0.15),
                          -1px 1px 0 rgba(0, 0, 0, 0.12)
                        `
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = isDark ? '#888892' : '#656565'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.textShadow = isDark
                        ? '0 1px 2px rgba(0,0,0,0.6)'
                        : `
                          0 1px 0 rgba(0, 0, 0, 0.22),
                          0 -1px 0 rgba(255, 255, 255, 0.65),
                          1px 1px 0 rgba(0, 0, 0, 0.12),
                          -1px 1px 0 rgba(0, 0, 0, 0.10)
                        `
                    }
                  }}
                >
                  {item.label}
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </motion.nav>
  )
}
