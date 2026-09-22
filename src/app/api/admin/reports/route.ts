// @ts-nocheck
/* ============================================================
   (و65) التقارير الجاهزة للطباعة — طلب المستر الحرفي:
   «زرار أطبع ملف PDF تقرير لحاله لكل طالب — الامتحانات اللي قدمها
    والواجبات ونسبة مشاهدة الفيديو» + «ملف لكل الطلاب والفيديوهات
    اللي نازلة في المنصة وهو ما شافهاش والواجبات اللي قدمها
    والامتحانات والدرجة»

   GET /api/admin/reports?type=student&id=<studentId>
     → تقرير طالب واحد بالتفصيل (امتحانات + واجبات + كل فيديوهات صفه
       ونسبة مشاهدته فيها)

   GET /api/admin/reports?type=class&grade=<grade>
     → تقرير شامل لكل الطلاب (grade فاضي = كل الصفوف): لكل طالب
       الفيديوهات اللي مش شافهاش + الواجبات اللي قدمها + الامتحانات
       ودرجاته

   ملاحظات:
   - نسبة المشاهدة = watchedSeconds/totalSeconds، والفيديو يعتبر
     «شافه» لو نسبته ≥ 90% (نفس عتبة completed في مشغل الفيديو)
   - مطابقة الصف بنفس سماحية /api/students/analytics (التوحيد + أول كلمة)
   - الطلاب في التقرير الشامل = المفعلين بس (approved / paid)
   ============================================================ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/* توحيد أسماء الصفوف — نفس منطق /api/students/analytics بالظبط */
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

/* مطابقة صف بعنصر (فيديو/امتحان/واجب) — نفس سماحية analytics:
   نفس الاسم بعد التوحيد، أو أول كلمة من صف الطالب جوه اسم العنصر */
function gradeMatches(itemGrade: string, studentGrade: string): boolean {
  if (!itemGrade || !studentGrade) return false
  if (itemGrade === studentGrade) return true
  var ni = normalizeGrade(itemGrade)
  var ns = normalizeGrade(studentGrade)
  if (ni === ns) return true
  var first = ns.split(' ')[0]
  return !!first && itemGrade.indexOf(first) !== -1
}

/* نسبة المشاهدة — زي ما بتتحسب في progress API */
function watchPercent(watchedSeconds: number, totalSeconds: number, completed: boolean): number {
  if (totalSeconds > 0) return Math.min(100, Math.round((watchedSeconds / totalSeconds) * 100))
  return completed ? 100 : 0
}

function roundNum(v: any): number {
  return Math.round(Number(v) || 0)
}

/* حكم النجاح — لو درجة النجاح المسجلة أكبر من النهاية الكبرى (إعداد ناقص:
   passScore=50 الافتراضي مع امتحان نهايته 24 مثلًا) نعتبر درجة النجاح
   50% من النهاية — عشان درجة كاملة ما تظهرش «راسب» في التقرير */
function examPassed(score: number, maxScore: number, passScore: number): boolean {
  var eff = passScore > maxScore ? maxScore * 0.5 : passScore
  return score >= eff
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'student'

    /* تنظيف اليتامى — نفس عادات باقي APIs المتابعة: نتيجة مالهاش أصل مبتظهرش */
    try { await db.$executeRawUnsafe('DELETE FROM HomeworkResult WHERE homeworkId NOT IN (SELECT id FROM Homework)') } catch (e) {}
    try { await db.$executeRawUnsafe('DELETE FROM ExamResult WHERE examId NOT IN (SELECT id FROM Exam)') } catch (e) {}
    try { await db.$executeRawUnsafe('DELETE FROM VideoProgress WHERE videoId NOT IN (SELECT id FROM Video)') } catch (e) {}

    /* ============================================================
       (1) تقرير طالب واحد بالتفصيل
       ============================================================ */
    if (type === 'student') {
      const id = searchParams.get('id') || ''
      if (!id) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })

      var studentRows = await db.$queryRawUnsafe(
        'SELECT id, name, phone, grade, status, parentName, parentPhone, createdAt FROM Student WHERE id = ? LIMIT 1',
        id
      )
      if (!studentRows || studentRows.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      }
      var st = studentRows[0]

      /* الامتحانات اللي قدمها (مع درجة النجاح من الامتحان نفسه) */
      var examRaw = await db.$queryRawUnsafe(
        `SELECT er.score, er.maxScore, er.submittedAt, e.title AS examTitle, e.passScore, e.id AS examId, e.grade AS examGrade
         FROM ExamResult er INNER JOIN Exam e ON er.examId = e.id
         WHERE er.studentId = ? ORDER BY er.submittedAt DESC`,
        id
      ) || []

      /* الواجبات اللي قدمها */
      var hwRaw = await db.$queryRawUnsafe(
        `SELECT hr.score, hr.maxScore, hr.submittedAt, h.title AS hwTitle
         FROM HomeworkResult hr INNER JOIN Homework h ON hr.homeworkId = h.id
         WHERE hr.studentId = ? ORDER BY hr.submittedAt DESC`,
        id
      ) || []

      /* كل فيديوهات صفه + تقدمه فيها (المشاهدة لكل فيديو) */
      var allVideos = await db.$queryRawUnsafe('SELECT id, title, grade FROM Video') || []
      var hisVideos = allVideos.filter(function (v) { return gradeMatches(v.grade, st.grade) })
      var progressRows = await db.$queryRawUnsafe(
        'SELECT videoId, watchedSeconds, totalSeconds, completed, lastWatchedAt FROM VideoProgress WHERE studentId = ?',
        id
      ) || []
      var progressMap = {}
      progressRows.forEach(function (p) { progressMap[p.videoId] = p })

      var videos = hisVideos.map(function (v) {
        var p = progressMap[v.id]
        var percent = p ? watchPercent(Number(p.watchedSeconds) || 0, Number(p.totalSeconds) || 0, !!p.completed) : 0
        return {
          id: v.id,
          title: v.title,
          percent: percent,
          /* عتبة «شافه» = 90% زي عتبة completed في المشغل — Boolean عشان ميرجعش undefined */
          watched: Boolean(percent >= 90 || (p && !!p.completed)),
          lastWatchedAt: p ? p.lastWatchedAt : null,
        }
      })
      /* الأقل مشاهدة الأول — عشان المستر يشوف الناقص من غير لف */
      videos.sort(function (a, b) { return a.percent - b.percent })

      var examRows = examRaw.map(function (r) {
        return {
          title: r.examTitle,
          score: roundNum(r.score),
          maxScore: roundNum(r.maxScore) || 100,
          passed: examPassed(Number(r.score) || 0, roundNum(r.maxScore) || 100, Number(r.passScore) || 50),
          submittedAt: r.submittedAt || null,
        }
      })
      var hwRows = hwRaw.map(function (r) {
        return {
          title: r.hwTitle,
          score: roundNum(r.score),
          maxScore: roundNum(r.maxScore) || 100,
          submittedAt: r.submittedAt || null,
        }
      })

      var watchedCount = videos.filter(function (v) { return v.watched }).length

      /* (MG-2) كل امتحانات صف الطالب — اللي دخلها ويا درجته + اللي لسه ما دخلهوش
         (score: null) — عشان رسالة ولي الأمر تقول «دخل» و«لسه ما دخلهوش» */
      var examTakenMap = {}
      examRaw.forEach(function (r) { if (r.examId) examTakenMap[r.examId] = r })
      var allGradeExams = ((await db.$queryRawUnsafe('SELECT id, title, grade FROM Exam')) || [])
        .filter(function (e) { return gradeMatches(e.grade, st.grade) })
      var allExams = allGradeExams.map(function (e) {
        var taken = examTakenMap[e.id]
        return {
          id: e.id,
          title: e.title,
          score: taken ? roundNum(taken.score) : null,
          maxScore: taken ? (roundNum(taken.maxScore) || 100) : null,
          submittedAt: taken ? (taken.submittedAt || null) : null,
        }
      })
      /* الواجبات المنوية لصفه كلها — عشان نقول سلم كام من كام */
      var allGradeHw = ((await db.$queryRawUnsafe('SELECT id, title, grade FROM Homework')) || [])
        .filter(function (h) { return gradeMatches(h.grade, st.grade) })

      var summary = {
        videosWatched: watchedCount,
        totalVideos: videos.length,
        avgPercent: videos.length ? Math.round(videos.reduce(function (s, v) { return s + v.percent }, 0) / videos.length) : 0,
        examsTaken: examRows.length,
        examsPassed: examRows.filter(function (e) { return e.passed }).length,
        avgExamScore: examRows.length ? Math.round(examRows.reduce(function (s, e) { return s + e.score }, 0) / examRows.length) : 0,
        hwDone: hwRows.length,
        avgHwScore: hwRows.length ? Math.round(hwRows.reduce(function (s, h) { return s + h.score }, 0) / hwRows.length) : 0,
      }

      return NextResponse.json({
        student: st,
        exams: examRows,
        allExams: allExams,
        homework: hwRows,
        homeworkTotal: allGradeHw.length,
        videos: videos,
        summary: summary,
        generatedAt: new Date().toISOString(),
      })
    }

    /* ============================================================
       (2) التقرير الشامل — لكل الطلاب (صف معين أو كل الصفوف)
       ============================================================ */
    if (type === 'class') {
      const gradeFilter = (searchParams.get('grade') || '').trim()

      var studentsRaw
      if (gradeFilter) {
        var ng = normalizeGrade(gradeFilter)
        var fw = ng.split(' ')[0]
        studentsRaw = await db.$queryRawUnsafe(
          `SELECT id, name, phone, grade, status FROM Student
           WHERE status IN ('approved','paid') AND (grade = ? OR grade = ? OR grade LIKE ?)
           ORDER BY name`,
          gradeFilter, ng, '%' + fw + '%'
        ) || []
      } else {
        studentsRaw = await db.$queryRawUnsafe(
          `SELECT id, name, phone, grade, status FROM Student
           WHERE status IN ('approved','paid')`
        ) || []
      }

      if (!studentsRaw || studentsRaw.length === 0) {
        return NextResponse.json({ students: [], generatedAt: new Date().toISOString() })
      }

      var ids = studentsRaw.map(function (s) { return s.id })
      var ph = ids.map(function () { return '?' }).join(',')

      /* كل نتايج الامتحانات والواجبات بتاعة الطلاب دول */
      var examAll = await db.$queryRawUnsafe(
        `SELECT er.studentId, er.score, er.maxScore, er.submittedAt, e.title, e.passScore
         FROM ExamResult er INNER JOIN Exam e ON er.examId = e.id
         WHERE er.studentId IN (${ph})`,
        ...ids
      ) || []
      var hwAll = await db.$queryRawUnsafe(
        `SELECT hr.studentId, hr.score, hr.maxScore, hr.submittedAt, h.title
         FROM HomeworkResult hr INNER JOIN Homework h ON hr.homeworkId = h.id
         WHERE hr.studentId IN (${ph})`,
        ...ids
      ) || []

      /* كل الفيديوهات + كل التقدم — والمطابقة بالصف في الذاكرة
         (كل طالب بيتحسب against فيديوهات صفه هو) */
      var videosAll = await db.$queryRawUnsafe('SELECT id, title, grade FROM Video') || []
      var progressAll = await db.$queryRawUnsafe(
        'SELECT studentId, videoId, watchedSeconds, totalSeconds, completed FROM VideoProgress'
      ) || []
      var progressByStudent = {}
      progressAll.forEach(function (p) {
        if (!progressByStudent[p.studentId]) progressByStudent[p.studentId] = {}
        progressByStudent[p.studentId][p.videoId] = p
      })

      var out = studentsRaw.map(function (s) {
        var myExams = examAll.filter(function (r) { return r.studentId === s.id }).map(function (r) {
          return {
            title: r.title,
            score: roundNum(r.score),
            maxScore: roundNum(r.maxScore) || 100,
            passed: examPassed(Number(r.score) || 0, roundNum(r.maxScore) || 100, Number(r.passScore) || 50),
          }
        })
        var myHw = hwAll.filter(function (r) { return r.studentId === s.id }).map(function (r) {
          return {
            title: r.title,
            score: roundNum(r.score),
            maxScore: roundNum(r.maxScore) || 100,
          }
        })

        var myGradeVideos = videosAll.filter(function (v) { return gradeMatches(v.grade, s.grade) })
        var myProg = progressByStudent[s.id] || {}
        var unwatched = []
        var watched = 0
        myGradeVideos.forEach(function (v) {
          var p = myProg[v.id]
          var percent = p ? watchPercent(Number(p.watchedSeconds) || 0, Number(p.totalSeconds) || 0, !!p.completed) : 0
          if (percent >= 90 || (p && !!p.completed)) watched++
          else unwatched.push(v.title)
        })

        return {
          id: s.id,
          name: s.name,
          phone: s.phone,
          grade: s.grade,
          exams: myExams,
          avgExam: myExams.length ? Math.round(myExams.reduce(function (acc, e) { return acc + e.score }, 0) / myExams.length) : 0,
          hw: myHw,
          videosTotal: myGradeVideos.length,
          videosWatched: watched,
          unwatched: unwatched,
        }
      })

      /* ترتيب: الصف ثم الاسم — عشان الطباعة تطلع مجموعات مرتبة */
      out.sort(function (a, b) {
        var g = String(a.grade || '').localeCompare(String(b.grade || ''), 'ar')
        if (g !== 0) return g
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar')
      })

      return NextResponse.json({
        students: out,
        generatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 })
  }
}
