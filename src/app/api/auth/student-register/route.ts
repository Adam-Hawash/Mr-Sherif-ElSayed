import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, phone, password, grade, parentName, parentPhone } = body;

    if (!name || !phone || !password) {
      return NextResponse.json(
        { error: "الرجاء إدخال الاسم، رقم الهاتف، وكلمة المرور" },
        { status: 400 }
      );
    }

    const cleanPhone = String(phone).trim();

    // التحقق هل رقم الهاتف مسجل مسبقاً
    const existing = await db.student.findUnique({
      where: { phone: cleanPhone },
    });

    if (existing) {
      return NextResponse.json(
        { error: "رقم الهاتف مسجل مسبقاً، يمكنك تسجيل الدخول مباشرة" },
        { status: 400 }
      );
    }

    // إنشاء حساب الطالب بنجاح
    const student = await db.student.create({
      data: {
        name: String(name).trim(),
        phone: cleanPhone,
        password: String(password),
        grade: grade || "الصف الثالث الإعدادي",
        parentName: parentName ? String(parentName).trim() : "",
        parentPhone: parentPhone ? String(parentPhone).trim() : "",
        status: "active",
        isPaidAccess: false,
        loginCount: 1,
        lastLogin: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        phone: student.phone,
        grade: student.grade,
        status: student.status,
        isPaidAccess: student.isPaidAccess,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "حدث خطأ أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
