import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin, getStudentAnyStatus, computePlayback, safeThumb } from "@/lib/video-guard";

export const dynamic = "force-dynamic";

// GET بيرجع بيانات العرض بس من غير اللينكات الخام أبداً (حماية السرقة).
// التشغيل الفعلي عن طريق /api/video-play اللي بيرجّع ytId أو توكن موقّع.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const adminId = searchParams.get("adminId");

    const video = await db.video.findUnique({ where: { id } });
    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    const admin = await isAdmin(adminId);
    const student = admin ? null : await getStudentAnyStatus(studentId);

    // الزوار غير المسجلين: الفيديوهات المجانية بس
    if (!admin && !student) {
      const isFree = !video.price || Number(video.price) <= 0;
      if (!isFree) {
        return NextResponse.json({ error: "الفيديو غير متاح" }, { status: 404 });
      }
    }

    let isUnlocked = Number(video.price || 0) <= 0;

    if (studentId && !isUnlocked) {
      const result = await computePlayback(id, studentId);
      isUnlocked = result.ok;
    }

    if (admin) {
      return NextResponse.json({ ...video, isUnlocked, isLocked: !isUnlocked });
    }

    return NextResponse.json({
      ...video,
      url: "",
      filePath: "",
      thumb: safeThumb(video),
      isUnlocked,
      isLocked: !isUnlocked,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { adminId } = body;

    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: "غير مسموح" }, { status: 401 });
    }

    const video = await db.video.update({
      where: { id },
      data: {
        ...body,
        adminId: undefined,
        price: body.price !== undefined ? Number(body.price) : undefined,
      },
    });
    return NextResponse.json(video);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get("adminId");

    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: "غير مسموح" }, { status: 401 });
    }

    try {
      await db.videoAccess.deleteMany({ where: { videoId: id } });
      await db.videoProgress.deleteMany({ where: { videoId: id } });
    } catch (e) {}
    await db.video.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "تم حذف الفيديو بنجاح" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
