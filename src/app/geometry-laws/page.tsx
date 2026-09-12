import type { Metadata } from 'next'
import { GeometryLaws } from '@/components/landing/GeometryLaws'

/* (2026-و31) نقل من منصة مستر وائل (Math Genius) طبق الأصل «هي هي» — طلب المستر حرفيًا:
   «عايزك تضيف لي الـ geometry برضه... الـ geometry بالظبط هو هو بتاع منصة مستر وائل، تكون هي هي» */
export var metadata: Metadata = {
  title: 'Geometry Laws — قوانين الهندسة | Mr. Sherif ElSayed',
  description:
    'كل قوانين الهندسة في صفحة واحدة: مساحات ومحيطات كل الأشكال، الحجوم ومساحات السطح، ونظرية فيثاغورس — من منصة مستر شريف السيد.',
}

export default function GeometryLawsPage() {
  return <GeometryLaws />
}
