/* ============================================================
   Firebase — تخزين طلبات الاعتراضات في Cloud Firestore
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyCuhUShrZMQlB6WCebc65JdAhKuljuuFhI",
  authDomain: "lattakia-uni.firebaseapp.com",
  projectId: "lattakia-uni",
  storageBucket: "lattakia-uni.firebasestorage.app",
  messagingSenderId: "856093892726",
  appId: "1:856093892726:web:d29411bc42d3ff31dfbf57",
  measurementId: "G-HXBVGYJGX5"
};

if (!window.firebase) {
  throw new Error("Firebase لم يتم تحميله. تأكد من وجود سكربتات Firebase في index.html و admin.html.");
}

const firebaseApp = firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();
const firebaseAuth = firebase.auth();

// 🔒 باب الاعتراضات: حالياً مفتوح. لتعطيله لاحقاً غيّر true إلى false فقط.
const APPEALS_ENABLED = true;

const APPEALS_COLLECTION = "appeals";

const APPEAL_STATUSES = {
  pending: "قيد المراجعة",
  reviewed: "تمت المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض"
};

function makeAppealRequestNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `REQ-${y}${m}${day}-${random}`;
}

function firestoreDate(value) {
  if (!value) return new Date().toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeAppeal(doc) {
  const d = doc.data() || {};
  return {
    id: doc.id,
    requestNo: d.requestNo || doc.id,
    subscriptionNumber: String(d.subscriptionNumber || ""),
    studentName: d.studentName || "",
    subjects: Array.isArray(d.subjects) ? d.subjects : [],
    notes: d.notes || "",
    status: d.status || "pending",
    statusLabel: APPEAL_STATUSES[d.status] || d.status || "قيد المراجعة",
    adminNote: d.adminNote || "",
    createdAt: firestoreDate(d.createdAt),
    updatedAt: firestoreDate(d.updatedAt)
  };
}

async function saveAppealToFirebase(payload) {
  const subscriptionNumber = String(payload.subscriptionNumber || "").trim();
  if (!subscriptionNumber) throw new Error("رقم الاكتتاب غير موجود");

  // نستخدم معرفاً ثابتاً مبنياً على رقم الاكتتاب حتى لا يستطيع الطالب
  // إنشاء أكثر من طلب اعتراض واحد، حتى لو ضغط إرسال عدة مرات بسرعة.
  const docId = `student_${subscriptionNumber.replace(/[^0-9A-Za-z_-]/g, "_")}`;
  const ref = firestore.collection(APPEALS_COLLECTION).doc(docId);
  const requestNo = makeAppealRequestNo();
  const data = {
    requestNo,
    subscriptionNumber,
    studentName: String(payload.studentName || ""),
    subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
    notes: String(payload.notes || ""),
    status: "pending",
    adminNote: "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    // مهم: Firebase Firestore Compat لا يدعم ref.create().
    // Transaction + get/set يمنع التكرار حتى مع محاولتين متزامنتين.
    await firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        throw new Error("APPEAL_ALREADY_EXISTS");
      }
      transaction.set(ref, data);
    });
  } catch (err) {
    if (err && (err.message === "APPEAL_ALREADY_EXISTS" || err.code === "already-exists")) {
      throw new Error("لديك طلب اعتراض سابق للتعديل، يرجى مراجعة شؤون الطلبة");
    }
    throw err;
  }

  const snap = await ref.get();
  const appeal = normalizeAppeal(snap);
  if (!appeal.createdAt) appeal.createdAt = new Date().toISOString();
  if (!appeal.updatedAt) appeal.updatedAt = appeal.createdAt;
  return appeal;
}

async function getExistingAppealForStudent(subscriptionNumber) {
  const id = String(subscriptionNumber || "").trim();
  if (!id) return null;

  // أولاً نبحث بالمعرّف الثابت الجديد.
  const docId = `student_${id.replace(/[^0-9A-Za-z_-]/g, "_")}`;
  const direct = await firestore.collection(APPEALS_COLLECTION).doc(docId).get();
  if (direct.exists) return normalizeAppeal(direct);

  // توافق مع أي طلبات قديمة محفوظة سابقاً بمعرّفات مختلفة.
  const snap = await firestore.collection(APPEALS_COLLECTION)
    .where("subscriptionNumber", "==", id)
    .limit(1)
    .get();
  return snap.empty ? null : normalizeAppeal(snap.docs[0]);
}

async function trackAppealFromFirebase(subscriptionNumber, requestNo) {
  const id=String(subscriptionNumber||"").trim(); const no=String(requestNo||"").trim().toUpperCase();
  if(!id||!no) return null;
  const snap=await firestore.collection(APPEALS_COLLECTION).where("subscriptionNumber","==",id).where("requestNo","==",no).limit(1).get();
  if(snap.empty) return null;
  return normalizeAppeal(snap.docs[0]);
}

async function loadAppealsFromFirebase(status = "all") {
  const snap = await firestore.collection(APPEALS_COLLECTION).get();
  let appeals = snap.docs.map(normalizeAppeal);

  appeals.sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });

  if (status && status !== "all") {
    appeals = appeals.filter(a => a.status === status);
  }
  return appeals;
}

async function updateAppealInFirebase(id, status, adminNote) {
  if (!id) throw new Error("معرّف الطلب غير موجود");
  if (!Object.prototype.hasOwnProperty.call(APPEAL_STATUSES, status)) {
    throw new Error("حالة الطلب غير صالحة");
  }

  const ref = firestore.collection(APPEALS_COLLECTION).doc(String(id));
  await ref.update({
    status,
    adminNote: String(adminNote || ""),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const snap = await ref.get();
  if (!snap.exists) throw new Error("الطلب غير موجود بعد الحفظ");
  return normalizeAppeal(snap);
}

/*
  لا يوجد API_BASE_URL ولا SQLite هنا.
  كل طلب اعتراض يُحفظ مباشرة في Cloud Firestore.
*/
const API_BASE_URL = "";
function apiUrl(path) {
  return path;
}

/*
  هذا المتغير كان مستخدماً في النسخة القديمة.
  اتركه فارغاً؛ حماية لوحة الإدارة في الإنتاج يجب أن تكون عبر
  Firebase Authentication + Security Rules، وليس مفتاحاً سرياً داخل JavaScript.
*/
const ADMIN_API_KEY = "";
