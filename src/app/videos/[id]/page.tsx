"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Lock, CreditCard, ArrowRight, CheckCircle2 } from "lucide-react";
import { ProtectedYouTubePlayer } from "@/components/student/ProtectedYouTubePlayer";

function getYouTubeId(url: string): string | null {
  const match = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return match ? match[1] : null;
}

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const videoId = resolvedParams.id;

  const [video, setVideo] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let currentStudent: any = null;
    try {
      const stored = localStorage.getItem("mg_student") || localStorage.getItem("student") || localStorage.getItem("user");
      if (stored) {
        currentStudent = JSON.parse(stored);
        setStudent(currentStudent);
      }
    } catch (e) {}

    async function load() {
      try {
        const sId = currentStudent?.id || "";
        const res = await fetch(`/api/videos/${videoId}?studentId=${sId}`);
        if (res.ok) {
          const data = await res.json();
          setVideo(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [videoId]);

  if (loading) return <div className="p-12 text-center font-bold text-slate-600">جاري تحميل الدرس...</div>;
  if (!video) return <div className="p-12 text-center text-red-500 font-bold">الفيديو غير موجود</div>;

  const isFreeVideo = !video.price || Number(video.price) === 0;
  const hasFreePass = student?.isPaidAccess === true || student?.role === "admin";
  const isPurchased = video.isPurchased === true;
  const isLocked = !isFreeVideo && !hasFreePass && !isPurchased;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      <Link href="/videos" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600">
        <ArrowRight className="w-4 h-4" /> العودة للمكتبة
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-lg">
            {video.grade || "الصف الثالث الثانوي"}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{video.title}</h1>
        </div>

        <div>
          {hasFreePass ? (
            <span className="bg-emerald-100 text-emerald-800 px-3.5 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> حسابك مفعل (اشتراك شامل)
            </span>
          ) : isFreeVideo ? (
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-xl font-bold text-xs">درس مجاني</span>
          ) : (
            <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded-xl font-bold text-xs">
              سعر الدرس: {video.price} ج.م
            </span>
          )}
        </div>
      </div>

      <div className="bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
        {isLocked ? (
          <div className="aspect-video flex flex-col items-center justify-center p-8 text-center text-white space-y-4">
            <div className="w-20 h-20 bg-red-500/20 text-red-400 rounded-3xl flex items-center justify-center border border-red-500/30">
              <Lock className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black">هذا الدرس مقفل</h2>
            <p className="text-slate-400 text-sm">
              لم يتم تفعيل هذا الفيديو لحسابك بعد. سعر التفعيل:{" "}
              <span className="text-amber-400 font-bold text-lg">{video.price} ج.م</span>
            </p>
            <Link
              href={`/payment?videoId=${video.id}&price=${video.price}&title=${encodeURIComponent(video.title)}`}
              className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-sm transition-all inline-flex items-center gap-2 shadow-lg"
            >
              <CreditCard className="w-5 h-5" />
              الانتقال لصفحة الدفع لتفعيل الدرس
            </Link>
          </div>
        ) : (
          <div className="aspect-video bg-black flex items-center justify-center">
            {getYouTubeId(video.url || "") ? (
              <ProtectedYouTubePlayer
                ytId={getYouTubeId(video.url || "") as string}
                poster={video.thumbnail || undefined}
                videoId={video.id}
              />
            ) : video.filePath && /\.(mp4|webm|mov|avi)$/i.test(video.filePath || "") ? (
              <video
                src={video.filePath}
                controls
                playsInline
                className="w-full h-full"
                style={{ border: "none" }}
              />
            ) : (
              <div className="text-slate-500 text-sm">لا يوجد فيديو</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
