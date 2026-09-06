"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  CreditCard,
  Phone,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  XCircle,
  Copy,
  Lock,
  ShieldCheck,
  Store,
} from "lucide-react";

function PaymentContent() {
  const searchParams = useSearchParams();
  const { student } = useAuth();

  const paramVideoId = searchParams.get("videoId") || "";
  const paramTitle = searchParams.get("title") || "";
  const paramPrice = searchParams.get("price") || "";

  const [videoId, setVideoId] = useState(paramVideoId);
  const [videoTitle, setVideoTitle] = useState(paramTitle);
  const [amount, setAmount] = useState(paramPrice || "150");
  const [method, setMethod] = useState("فودافون كاش (Vodafone Cash)");
  const [studentName, setStudentName] = useState(student?.name || "");
  const [studentPhone, setStudentPhone] = useState(student?.phone || "");
  const [studentGrade, setStudentGrade] = useState(student?.grade || "الصف الثالث الثانوي");
  const [receiptImage, setReceiptImage] = useState<string>("");
  const [transactionRef, setTransactionRef] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedText, setCopiedText] = useState("");
  const [myPayments, setMyPayments] = useState<any[]>([]);

  useEffect(() => {
    if (paramVideoId) setVideoId(paramVideoId);
    if (paramTitle) setVideoTitle(paramTitle);
    if (paramPrice) setAmount(paramPrice);
  }, [paramVideoId, paramTitle, paramPrice]);

  useEffect(() => {
    if (student) {
      setStudentName(student.name);
      setStudentPhone(student.phone);
      setStudentGrade(student.grade);
      fetchMyPayments(student.id);
    }
  }, [student]);

  const fetchMyPayments = async (sId: string) => {
    try {
      const res = await fetch(`/api/payments?studentId=${sId}`);
      if (res.ok) {
        const data = await res.json();
        setMyPayments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!studentPhone) {
      setErrorMsg("يرجى إدخال رقم الهاتف");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student?.id || "temp-" + Date.now(),
          studentName: studentName || "طالب جديد",
          studentPhone: studentPhone,
          studentGrade: studentGrade,
          method,
          amount: Number(amount),
          videoId,
          videoTitle: videoTitle || "تفعيل درس تعليمي",
          receiptPath: receiptImage,
          note: `${note} ${transactionRef ? `(مرجع العملية: ${transactionRef})` : ""}`.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إرسال الطلب");

      setSuccessMsg("تم إرسال إيصال الدفع بنجاح! سيتم مراجعة التحويل وتفعيل الفيديو لك فوراً.");
      setReceiptImage("");
      setTransactionRef("");
      setNote("");
      if (student?.id) fetchMyPayments(student.id);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10" dir="rtl">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          بوابة الدفع والتفعيل المعتمدة
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
          تفعيل الفيديوهات والدروس التعليمية
        </h1>
        <p className="text-slate-600 text-sm max-w-xl mx-auto">
          اختر وسيلة الدفع المناسبة لك من الخيارات الثلاثة المعتمدة في مصر (فودافون كاش، إنستاباي، فوري)
        </p>
      </div>

      {videoId && (
        <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-amber-800 font-bold block">الفيديو المراد شراؤه وتفعيله:</span>
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">{videoTitle}</h3>
            </div>
          </div>
          <div className="text-right sm:text-left bg-white px-4 py-2 rounded-2xl border border-amber-200">
            <span className="text-xs text-amber-700 block font-bold">المبلغ المطلوب:</span>
            <span className="text-xl font-black text-amber-900">{amount} ج.م</span>
          </div>
        </div>
      )}

      {/* 3 طرق دفع معتمدة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Vodafone Cash */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-red-600 via-red-500 to-rose-600 text-white shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-xl">
                1. فودافون كاش
              </span>
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-red-100 block font-semibold">رقم محفظة فودافون كاش:</span>
              <div className="text-2xl font-black tracking-wider mt-1 font-mono">01012345678</div>
            </div>
            <p className="text-xs text-red-100">
              كود التحويل السريع: <span className="font-mono font-bold bg-black/20 px-1 py-0.5 rounded">#المبلغ*الرقم*7*9*</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard("01012345678", "vodafone")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-red-600 hover:bg-red-50 font-black text-xs transition-all"
          >
            {copiedText === "vodafone" ? <><Check className="w-4 h-4" /> تم نسخ الرقم!</> : <><Copy className="w-4 h-4" /> نسخ رقم فودافون كاش</>}
          </button>
        </div>

        {/* 2. InstaPay */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-700 via-indigo-600 to-indigo-800 text-white shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-xl">
                2. إنستاباي - InstaPay
              </span>
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-purple-100 block font-semibold">عنوان الدفع اللحظي (IPA):</span>
              <div className="text-xl font-black tracking-wider mt-1 font-mono truncate">mathsgenius@instapay</div>
            </div>
            <p className="text-xs text-purple-100">تحويل فوري مجاني من أي تطبيق بنكي أو محفظة.</p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard("mathsgenius@instapay", "instapay")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-purple-700 hover:bg-purple-50 font-black text-xs transition-all"
          >
            {copiedText === "instapay" ? <><Check className="w-4 h-4" /> تم النسخ!</> : <><Copy className="w-4 h-4" /> نسخ عنوان إنستاباي</>}
          </button>
        </div>

        {/* 3. Fawry */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 text-white shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-xl">
                3. فوري - Fawry
              </span>
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-amber-100 block font-semibold">رقم التحويل / كود فوري:</span>
              <div className="text-2xl font-black tracking-wider mt-1 font-mono">01012345678</div>
            </div>
            <p className="text-xs text-amber-100">ادفع من أي منفذ فوري أو ماكينة فوري بلس بالرقم أعلاه.</p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard("01012345678", "fawry")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-amber-800 hover:bg-amber-50 font-black text-xs transition-all"
          >
            {copiedText === "fawry" ? <><Check className="w-4 h-4" /> تم نسخ الرقم!</> : <><Copy className="w-4 h-4" /> نسخ رقم فوري</>}
          </button>
        </div>
      </div>

      {/* نموذج الإرسال */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <h2 className="text-xl font-black text-slate-900 border-b pb-4">
          نموذج تأكيد التحويل وتفعيل الفيديو
        </h2>

        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الطالب</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="أحمد محمد"
                required
                className="w-full px-4 py-2.5 rounded-xl border text-sm font-semibold bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الهاتف المسجل بالمنصة</label>
              <input
                type="tel"
                value={studentPhone}
                onChange={(e) => setStudentPhone(e.target.value)}
                placeholder="010xxxxxxxx"
                required
                className="w-full px-4 py-2.5 rounded-xl border text-sm font-mono bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">طريقة التحويل</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border text-sm font-bold bg-white"
              >
                <option value="فودافون كاش (Vodafone Cash)">📱 1. فودافون كاش (Vodafone Cash)</option>
                <option value="إنستاباي (InstaPay)">⚡ 2. إنستاباي (InstaPay)</option>
                <option value="فوري (Fawry)">🏪 3. فوري (Fawry / FawryPay)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">المبلغ المحول (ج.م)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border text-sm font-black bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">صورة إيصال التحويل (Screenshot)</label>
            <div className="border-2 border-dashed rounded-2xl p-6 text-center bg-slate-50 relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {receiptImage ? (
                <div className="space-y-2">
                  <img src={receiptImage} alt="Receipt" className="max-h-40 mx-auto rounded-xl shadow-md" />
                  <span className="text-xs text-emerald-600 font-bold">✓ تم اختيار الصورة (انقر للتغيير)</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 mx-auto text-emerald-600" />
                  <div className="text-sm font-bold text-slate-700">اضغط هنا لرفع صورة إيصال التحويل</div>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg transition-all"
          >
            {loading ? "جاري إرسال الطلب..." : `تأكيد الدفع وإرسال إشعار التفعيل (${amount} ج.م)`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 font-bold">جاري تحميل صفحة الدفع...</div>}>
      <PaymentContent />
    </Suspense>
  );
}
