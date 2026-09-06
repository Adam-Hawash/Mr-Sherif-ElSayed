import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    var searchParams = new URL(request.url).searchParams
    var phone = searchParams.get('phone')
    var grade = searchParams.get('grade')
    var status = searchParams.get('status')
    var keyword = searchParams.get('keyword')
    var page = parseInt(searchParams.get('page') || '1')
    var pageSize = parseInt(searchParams.get('pageSize') || '20')

    if (phone) {
      var password = searchParams.get('password') || ''
      try {
        var student = await db.student.findFirst({
          where: { phone },
          include: { _count: { select: { activities: true } } },
        })
        if (!student) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        // Password check for login
        if (!password || student.password !== password) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        return NextResponse.json({ students: [{ ...student, watchedVideoCount: 0 }], total: 1, page: 1, pageSize: 1, totalPages: 1 })
      } catch (loginErr: any) {
        console.error('Student login error:', loginErr)
        return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
      }
    }

    var where: Record<string, unknown> = {}
    if (grade) where.grade = grade
    if (status) where.status = status
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ]
    }

    var [students, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { activities: true } } },
      }),
      db.student.count({ where }),
    ])

    var allStudentIds = students.map(function(s) { return s.id })
    var watchedVideos = allStudentIds.length > 0
      ? await db.studentActivity.groupBy({
          by: ['studentId'],
          where: { studentId: { in: allStudentIds }, action: 'watched_video' },
          _count: { id: true },
        })
      : []
    var watchMap: Record<string, number> = {}
    for (var w = 0; w < watchedVideos.length; w++) {
      watchMap[watchedVideos[w].studentId] = watchedVideos[w]._count.id
    }

    var studentsWithStats = students.map(function(s) {
      return { ...s, watchedVideoCount: watchMap[s.id] || 0 }
    })

    return NextResponse.json({
      students: studentsWithStats,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Students fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var name = body.name || ''
    var phone = body.phone || ''
    var grade = body.grade || ''
    var status = body.status || 'pending'
    var parentName = body.parentName || body.fatherName || ''
    var parentPhone = body.parentPhone || body.motherPhone || ''
    var password = body.password || ''

    if (!name || !phone || !grade) {
      return NextResponse.json({ error: 'الاسم ورقم الهاتف والصف مطلوبين' }, { status: 400 })
    }

    var student = await db.student.create({
      data: {
        name: name,
        phone: phone,
        grade: grade,
        status: status,
        parentName: parentName,
        parentPhone: parentPhone,
        password: password,
      },
    })

    try {
      await db.studentActivity.create({
        data: { studentId: student.id, action: 'registered', details: 'Registered as ' + grade },
      })
    } catch (_) {}

    fetch((process.env.NEXT_PUBLIC_BASE_URL || '') + '/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: name, studentPhone: phone, studentGrade: grade, parentName: parentName, parentPhone: parentPhone }),
    }).catch(function() {})

    return NextResponse.json({ message: 'Student created', student: student }, { status: 201 })
  } catch (error: any) {
    console.error('Student create error:', error)
    return NextResponse.json({ error: 'Failed to create student: ' + (error.message || 'Unknown error') }, { status: 500 })
  }
}
