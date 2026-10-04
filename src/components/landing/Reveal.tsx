'use client'

// ============================================================
// (و111-e) Reveal — تأثير «لما بنزل الحاجات بتتكون»:
//   العنصر بيظهر بتلاشي + صعود بسيط أول ما يدخل الشاشة مع
//   السكرول (مرة واحدة) — نفس تأثير منصة مستر صبري (ص5).
//   الاستخدام: <Reveal delay={0.1}> ... </Reveal>
// ============================================================

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.7, delay: delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default Reveal
