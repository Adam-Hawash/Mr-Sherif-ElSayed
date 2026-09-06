import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");

    const video = await db.video.findUnique({ where: { id } });
    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    let isUnlocked = Number(video.price || 0) <= 0;

    if (studentId && !isUnlocked) {
      // فقط نشوف لو في payment مقبول أو access مخصص لهذا الفيديو بالذات
      // مش بنعتمد على isPaidAccess لأن ده للاشتراك الشامل فقط
      const access = await db.videoAccess.findUnique({
        where: { videoId_studentId: { videoId: id, studentId } },
      });
      if (access) isUnlocked = true;

      // كمان نشوف لو في payment مقبول للفيديو ده
      if (!isUnlocked) {
        const approvedPayment = await db.payment.findFirst({
          where: { studentId, videoId: id, status: 'approved' },
        });
        if (approvedPayment) isUnlocked = true;
      }
    }

    return NextResponse.json({
      ...video,
      url: isUnlocked ? video.url : null,
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
    const video = await db.video.update({
      where: { id },
      data: {
        ...body,
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
