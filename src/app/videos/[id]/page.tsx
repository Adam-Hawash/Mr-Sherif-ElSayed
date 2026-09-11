"use client";

// ============================================================
// صفحة الدرس المنفصلة /videos/[id]
// ============================================================
// الحماية زي المنصة الرئيسية بالظبط: مفيش أي YouTube ID أو رابط ملف
// بييجي للصفحة دي خالص — التشغيل كله بتذكرة واحدة الاستخدام من
// /api/video-ticket والمشغل من /api/player/[ticket] (البروكسي).
// (النسخة القديمة كانت بتجيب ytId من /api/video-play — دي كانت ثغرة
//  سرب اللينك من الـ Network، واتقفلت خالص)
// ============================================================
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Lock, CreditCard, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { SecurePlayerModal } from "@/components/student/SecurePlayerModal";

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const videoId = resolvedParams.id;

  const [video, setVideo] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<string>("");
  const [ticketErr, setTicketErr] = useState<string>("");

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
          // بوابة التشغيل المحمية — تذكرة واحدة الاستخدام بس، مفيش أي لينك
          if (data.isUnlocked && !data.isLocked) {
            const tRes = await fetch(`/api/video-ticket?videoId=${videoId}&studentId=${encodeURIComponent(sId)}`);
            const tData = await tRes.json();
            if (tRes.ok && tData.ok && tData.ticket) setTicket(tData.ticket);
            else setTicketErr(tData.error || "الفيديو مش متاح — لو دفعت تواصل مع الإدارة");
          }
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

  const isUnlocked = video.isUnlocked === true && video.isLocked !== true;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      <Link href="/videos" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600">
        <ArrowRight className="w-4 h-4" /> العودة للمكتبة
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-lg">
            {video.grade || "أولى بكالوريا"}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{video.title}</h1>
        </div>

        <div>
          {student?.isPaidAccess === true || student?.role === "admin" ? (
            <span className="bg-emerald-100 text-emerald-800 px-3.5 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> حسابك مفعل (اشتراك شامل)
            </span>
          ) : !video.price || Number(video.price) === 0 ? (
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-xl font-bold text-xs">درس مجاني</span>
          ) : (
            <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded-xl font-bold text-xs">
              سعر الدرس: {video.price} ج.م
            </span>
          )}
        </div>
      </div>

      <div className="bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
        {!isUnlocked ? (
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
        ) : ticket ? (
          <div className="aspect-video bg-black relative">
            {/* المشغل الآمن — تذكرة واحدة الاستخدام، مفيش أي لينك في الصفحة */}
            <SecurePlayerModal
              ticket={ticket}
              title={video.title}
              poster={video.thumbnail || video.thumb || undefined}
              videoId={video.id}
              studentId={student?.id}
              onClose={function () { setTicket(""); }}
            />
          </div>
        ) : (
          <div className="aspect-video bg-black flex flex-col items-center justify-center gap-4 text-slate-300 text-sm">
            {ticketErr ? (
              <>
                <p className="text-red-400 font-bold">{ticketErr}</p>
                <button
                  type="button"
                  onClick={function () {
                    setTicketErr("");
                    const sId = student?.id || "";
                    fetch(`/api/video-ticket?videoId=${videoId}&studentId=${encodeURIComponent(sId)}`)
                      .then(function (r) { return r.json() })
                      .then(function (d) {
                        if (d && d.ok && d.ticket) setTicket(d.ticket);
                        else setTicketErr(d.error || "الفيديو مش متاح");
                      })
                      .catch(function () { setTicketErr("حصل خطأ في التشغيل") });
                  }}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-colors"
                >
                  جرب تشغيل تاني
                </button>
              </>
            ) : (
              <>
                <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
                <p>جاري فتح المشغل الآمن...</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
