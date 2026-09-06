// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Debug endpoint: trace homework results for a student
// GET /api/debug/hw-check?studentId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId')

  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 })
  }

  var result: any = {
    studentId,
    steps: [],
  }

  // Step 1: Ensure HomeworkResult table exists with answers + submittedAt columns
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS HomeworkResult (id TEXT PRIMARY KEY, homeworkId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT '', submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    result.steps.push('1: CREATE TABLE OK')
  } catch (e: any) {
    result.steps.push('1: CREATE TABLE error: ' + e.message)
  }
  try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN answers TEXT DEFAULT ""'); result.steps.push('1b: ALTER answers OK') } catch (e: any) { result.steps.push('1b: ALTER answers err: ' + e.message) }
  try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP'); result.steps.push('1c: ALTER submittedAt OK') } catch (e: any) { result.steps.push('1c: ALTER submittedAt err: ' + e.message) }

  // Step 2: PRAGMA table_info HomeworkResult
  try {
    var cols = await db.$queryRawUnsafe('PRAGMA table_info(HomeworkResult)')
    result.homeworkResultColumns = cols
    result.steps.push('2: PRAGMA HomeworkResult OK')
  } catch (e: any) {
    result.steps.push('2: PRAGMA HomeworkResult err: ' + e.message)
  }

  // Step 3: Count ALL HomeworkResult rows (no filter)
  try {
    var totalRows = await db.$queryRawUnsafe('SELECT COUNT(*) as c FROM HomeworkResult')
    result.totalHomeworkResults = totalRows
    result.steps.push('3: COUNT(*) HomeworkResult OK')
  } catch (e: any) {
    result.steps.push('3: COUNT err: ' + e.message)
  }

  // Step 4: Find all rows for this student
  try {
    var studentRows = await db.$queryRawUnsafe(
      'SELECT id, homeworkId, studentId, score, maxScore, submittedAt, length(answers) as answersLen FROM HomeworkResult WHERE studentId = ?',
      studentId
    )
    result.studentRows = studentRows
    result.steps.push('4: WHERE studentId=? OK (' + (studentRows?.length || 0) + ' rows)')
  } catch (e: any) {
    result.steps.push('4: WHERE studentId err: ' + e.message)
  }

  // Step 5: Test the EXACT JOIN query used by /api/students/[id]/progress
  try {
    var joinRows = await db.$queryRawUnsafe(
      'SELECT hr.id, hr.homeworkId, hr.score, hr.maxScore, hr.submittedAt, hr.answers, h.title, h.questions FROM HomeworkResult hr LEFT JOIN Homework h ON hr.homeworkId = h.id WHERE hr.studentId = ? ORDER BY hr.submittedAt DESC',
      studentId
    )
    result.joinRows = joinRows
    result.steps.push('5: JOIN query OK (' + (joinRows?.length || 0) + ' rows)')
  } catch (e: any) {
    result.steps.push('5: JOIN query err: ' + e.message)
    result.joinError = e.message
  }

  // Step 6: Check Homework table exists and PRAGMA
  try {
    var hwCols = await db.$queryRawUnsafe('PRAGMA table_info(Homework)')
    result.homeworkColumns = hwCols
    result.steps.push('6: PRAGMA Homework OK')
  } catch (e: any) {
    result.steps.push('6: PRAGMA Homework err: ' + e.message)
  }

  // Step 7: Check if Student exists
  try {
    var student = await db.$queryRawUnsafe('SELECT id, name, grade FROM Student WHERE id = ? LIMIT 1', studentId)
    result.student = student
    result.steps.push('7: Student lookup OK (' + (student?.length || 0) + ' rows)')
  } catch (e: any) {
    result.steps.push('7: Student lookup err: ' + e.message)
  }

  return NextResponse.json(result, { status: 200 })
}
