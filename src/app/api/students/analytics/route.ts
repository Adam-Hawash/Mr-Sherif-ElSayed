// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Normalize grade names
function normalizeGrade(grade: string): string {
  if (!grade) return ''
  var g = grade.trim()
  g = g.replace(/^الصف\s+/i, '')
  g = g.replace(/الاعدادي/gi, 'إعدادي').replace(/الإعدادي/gi, 'إعدادي')
  g = g.replace(/البكالوريا/gi, 'بكالوريا')
  if (g.includes('أولى') || g.includes('اولى') || g.includes('الأول')) g = 'أولى'
  if (g.includes('تانية') || g.includes('الثاني')) g = 'تانية'
  if (g.includes('تالتة') || g.includes('الثالث')) g = 'تالتة'
  if (g.includes('الرابع')) g = 'الرابع'
  if (g.includes('الخامس')) g = 'الخامس'
  if (g.includes('السادس')) g = 'السادس'
  if (g === 'أولى' && grade.includes('عداد')) g = 'أولى إعدادي'
  if (g === 'تانية' && grade.includes('عداد')) g = 'تانية إعدادي'
  if (g === 'تالتة' && grade.includes('عداد')) g = 'تالتة إعدادي'
  if (g === 'أولى' && grade.includes('كالور')) g = 'أولى بكالوريا'
  return g
}

// GET /api/students/analytics?grade=X - Get all students in grade with aggregated analytics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')

    if (!grade) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }

    // Normalize grade for fuzzy matching
    const normalizedGrade = normalizeGrade(grade)
    
    // Get all active students in this grade (approved or paid) with fuzzy matching
    const students = await db.student.findMany({
      where: {
        OR: [
          { grade: grade },
          { grade: normalizedGrade },
          { grade: { contains: normalizedGrade.split(' ')[0] } },
        ],
        status: { in: ['approved', 'paid'] }
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, grade: true, loginCount: true, lastLogin: true, createdAt: true },
    })

    if (students.length === 0) {
      return NextResponse.json({ students: [], gradeSummary: null })
    }

    const studentIds = students.map(s => s.id)

    // Get video progress for all students in this grade
    const allVideoProgress = await db.videoProgress.findMany({
      where: { studentId: { in: studentIds } },
    })

    // Get all videos for this grade (with fuzzy matching)
    const gradeVideos = await db.video.findMany({
      where: {
        OR: [
          { grade: grade },
          { grade: normalizedGrade },
          { grade: { contains: normalizedGrade.split(' ')[0] } },
        ]
      },
      select: { id: true, title: true },
    })
    const totalGradeVideos = gradeVideos.length
    const gradeVideoIds = new Set(gradeVideos.map(v => v.id))

    // Get all exams for this grade (with fuzzy matching)
    const gradeExams = await db.exam.findMany({
      where: {
        OR: [
          { grade: grade },
          { grade: normalizedGrade },
          { grade: { contains: normalizedGrade.split(' ')[0] } },
        ]
      },
      select: { id: true, title: true, passScore: true },
    })
    const totalGradeExams = gradeExams.length

    // Get all homework for this grade (with fuzzy matching)
    const gradeHomework = await db.homework.findMany({
      where: {
        OR: [
          { grade: grade },
          { grade: normalizedGrade },
          { grade: { contains: normalizedGrade.split(' ')[0] } },
        ]
      },
      select: { id: true, title: true },
    })
    const totalGradeHomework = gradeHomework.length
    const gradeHwIds = new Set(gradeHomework.map(h => h.id))

    // Get exam results for all students
    const allExamResults = await db.examResult.findMany({
      where: { studentId: { in: studentIds } },
    })

    // Get homework results using RAW SQL (Prisma model may be out of sync with Turso)
    var allHwResults: any[] = []
    try {
      if (studentIds.length > 0) {
        var placeholders = studentIds.map(function() { return '?' }).join(',')
        allHwResults = await db.$queryRawUnsafe(
          'SELECT studentId, homeworkId, score, maxScore FROM HomeworkResult WHERE studentId IN (' + placeholders + ')',
          ...studentIds
        ) || []
      }
    } catch (e) {
      console.error('Homework results fetch error (analytics):', e)
      allHwResults = []
    }

    // Build per-student analytics
    const studentAnalytics = students.map(student => {
      const vp = allVideoProgress.filter(p => p.studentId === student.id)
      const gradeVp = vp.filter(p => gradeVideoIds.has(p.videoId))
      const watchedCount = gradeVp.length
      const completedCount = gradeVp.filter(p => p.completed).length
      const avgWatchPercent = gradeVp.length > 0
        ? Math.min(100, Math.round(gradeVp.reduce((sum, p) => sum + Math.min(100, (p.totalSeconds > 0 ? (p.watchedSeconds / p.totalSeconds) * 100 : 0)), 0) / gradeVp.length))
        : 0

      const gradeExamIds = new Set(gradeExams.map(e => e.id))
      const er = allExamResults.filter(r => r.studentId === student.id && gradeExamIds.has(r.examId))
      const examsTaken = er.length
      const avgScore = er.length > 0 ? Math.round(er.reduce((s, r) => s + r.score, 0) / er.length) : 0
      const examsPassed = er.filter(r => {
        const exam = gradeExams.find(e => e.id === r.examId)
        return r.score >= (exam?.passScore || 50)
      }).length

      // Homework stats (from raw SQL results)
      const hw = allHwResults.filter(function(r) { return r.studentId === student.id && gradeHwIds.has(r.homeworkId) })
      const hwDone = hw.length
      const avgHwScore = hw.length > 0 ? Math.round(hw.reduce(function(s, r) { return s + (r.score || 0) }, 0) / hw.length) : 0

      // Activity score (composite)
      const videoScore = totalGradeVideos > 0 ? (watchedCount / totalGradeVideos) * 30 : 0
      const examScore = totalGradeExams > 0 ? (examsTaken / totalGradeExams) * 25 : 0
      const hwScore = totalGradeHomework > 0 ? (hwDone / totalGradeHomework) * 15 : 0
      const qualityScore = examsTaken > 0 ? (avgScore / 100) * 15 : 0
      const hwQualityScore = hwDone > 0 ? (avgHwScore / 100) * 10 : 0
      const loginScore = Math.min(student.loginCount, 10) * 0.5
      const activityScore = Math.round(videoScore + examScore + hwScore + qualityScore + hwQualityScore + loginScore)

      return {
        ...student,
        watchedVideos: watchedCount,
        completedVideos: completedCount,
        totalVideos: totalGradeVideos,
        avgWatchPercent,
        examsTaken,
        examsPassed,
        totalExams: totalGradeExams,
        avgExamScore: avgScore,
        homeworkDone: hwDone,
        totalHomework: totalGradeHomework,
        avgHwScore,
        activityScore: Math.min(activityScore, 100),
      }
    })

    // Grade summary
    const gradeSummary = {
      totalStudents: students.length,
      totalVideos: totalGradeVideos,
      totalExams: totalGradeExams,
      totalHomework: totalGradeHomework,
      avgWatchPercent: studentAnalytics.length > 0
        ? Math.round(studentAnalytics.reduce((s, a) => s + a.avgWatchPercent, 0) / studentAnalytics.length)
        : 0,
      avgExamScore: studentAnalytics.length > 0
        ? Math.round(studentAnalytics.reduce((s, a) => s + a.avgExamScore, 0) / studentAnalytics.length)
        : 0,
      avgHwScore: studentAnalytics.length > 0
        ? Math.round(studentAnalytics.reduce((s, a) => s + (a.avgHwScore || 0), 0) / studentAnalytics.length)
        : 0,
      avgActivity: studentAnalytics.length > 0
        ? Math.round(studentAnalytics.reduce((s, a) => s + a.activityScore, 0) / studentAnalytics.length)
        : 0,
    }

    studentAnalytics.sort((a, b) => b.activityScore - a.activityScore)

    return NextResponse.json({ students: studentAnalytics, gradeSummary })
  } catch (error) {
    console.error('Students analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
