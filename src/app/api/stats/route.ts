import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Fetch core stats that always exist
    var coreStats = await Promise.all([
      db.student.count(),
      db.student.count({ where: { status: 'pending' } }),
      db.student.count({ where: { status: 'approved' } }),
      db.video.count(),
      db.homework.count(),
      db.exam.count(),
      db.announcement.count(),
      db.discussion.count(),
    ])

    var result: Record<string, any> = {
      totalStudents: coreStats[0],
      pendingStudents: coreStats[1],
      approvedStudents: coreStats[2],
      totalVideos: coreStats[3],
      totalHomework: coreStats[4],
      totalExams: coreStats[5],
      totalAnnouncements: coreStats[6],
      totalDiscussions: coreStats[7],
      pendingPayments: 0,
    }

    // Fetch Payment count safely (table might not exist yet)
    try {
      result.pendingPayments = await db.payment.count({ where: { status: 'pending' } })
    } catch (e) {
      result.pendingPayments = 0
    }

    // Fetch grades
    try {
      var studentGrades = await db.student.findMany({
        select: { grade: true },
        distinct: ['grade'],
      })
      result.grades = studentGrades.map(function(s) { return s.grade })
    } catch (e) {
      result.grades = []
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
