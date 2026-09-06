import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const student = await db.student.findUnique({ where: { id } });
    if (!student) {
      return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    }

    const newPaidAccess =
      typeof body.isPaidAccess === "boolean" ? body.isPaidAccess : !student.isPaidAccess;

    const updated = await db.student.update({
      where: { id },
      data: {
        isPaidAccess: newPaidAccess,
      },
    });

    await db.studentActivity.create({
      data: {
        studentId: id,
        action: "تغيير نوع الاشتراك",
        details: newPaidAccess
          ? "تم تفعيل الوصول المجاني الكامل لجميع الفيديوهات (✓)"
          : "تم تحويل الحساب لنظام الدفع لكل فيديو ($)",
      },
    });

    return NextResponse.json({
      success: true,
      student: updated,
      message: newPaidAccess
        ? "تم تفعيل الاشتراك المجاني الشامل للطالب بنجاح (✓)"
        : "تم ضبط الحساب على نظام الدفع لكل فيديو ($)",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
