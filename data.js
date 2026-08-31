/* ============================================================
   data.js — تعريف المواد، تحميل بيانات الطلاب من ملفات JSON
   والإعدادات المشتركة بين الموقع العام ولوحة التحكم.
   الملفات المطلوبة بجانب index.html و admin.html:
     students1.json = الفصل الأول
     students2.json = الفصل الثاني
     students3.json = مواد الحملة
   ============================================================ */

const SUBJECTS_S1 = [
  { key: "physics",              name: "الفيزياء" },
  { key: "english1",             name: "اللغة الإنجليزية 1" },
  { key: "computerSkills1",      name: "مهارات الحاسوب 1" },
  { key: "arabic",               name: "اللغة العربية" },
  { key: "electricalProperties", name: "خواص مواد كهربائية" },
  { key: "math1",                name: "رياضيات 1" },
];

const SUBJECTS_S2 = [
  { key: "electricalEngBasics", name: "أسس هندسة كهربائية" },
  { key: "english2",            name: "اللغة الإنجليزية 2" },
  { key: "computerSkills2",     name: "مهارات الحاسوب 2" },
  { key: "introComputer",       name: "مدخل إلى الحاسوب" },
  { key: "workshops",           name: "ورشات تخصصية" },
  { key: "engineeringDrawing",  name: "الرسم والتمثيل الهندسي" },
  { key: "math2",               name: "رياضيات 2" },
];

const ALL_SUBJECTS = [...SUBJECTS_S1, ...SUBJECTS_S2];
const SUBJECT_NAME_BY_KEY = Object.fromEntries(ALL_SUBJECTS.map(s => [s.key, s.name]));

// البيانات تُملأ بعد قراءة ملفات JSON.
let students1 = [];
let students2 = [];
let students3 = [];
let ALL_STUDENTS = [];

const DEFAULT_CONFIG = {
  passingGrade: 60,
  passMaxCarried: 0,
  transferMaxCarried: 4,
  failMinCarried: 6,
  college: "كلية الهندسة الميكانيكية والكهربائية",
  department: "قسم هندسة الحاسبات والتحكم الآلي",
  university: "جامعة اللاذقية",
};

function loadStoredConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("universitySiteConfig") || "null");
    return { ...DEFAULT_CONFIG, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

const siteConfig = loadStoredConfig();

function loadStoredNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem("universityNotifications") || "null");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
}

let notifications = loadStoredNotifications();
if (!notifications.length) {
  notifications = [
    { id: 1, title: "صدور نتائج الفصل الأول", body: "تم اعتماد نتائج مواد الفصل الأول بالكامل، بالتوفيق للجميع 🌟", target: "all", date: "2026-08-20" },
    { id: 2, title: "تنويه لحاملي مادة واحدة", body: "امتحانات الدور الثاني ستُعقد الأسبوع القادم، يرجى مراجعة برنامج الامتحانات.", target: "carried:1", date: "2026-08-25" },
  ];
  saveNotificationsToStorage();
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && row.subscriptionNumber !== undefined).map(row => ({ ...row }));
}

async function loadStudentJSON() {
  const names = ["students1.json", "students2.json", "students3.json"];
  try {
    const responses = await Promise.all(names.map(name => fetch(name, { cache: "no-store" })));
    if (responses.some(r => !r.ok)) throw new Error("تعذر تحميل أحد ملفات بيانات الطلاب");
    const payloads = await Promise.all(responses.map(r => r.json()));
    students1 = normalizeRows(payloads[0]);
    students2 = normalizeRows(payloads[1]);
    students3 = normalizeRows(payloads[2]);
    rebuildStudentRecords();
    return true;
  } catch (error) {
    console.error(error);
    // نحافظ على الموقع قابلاً للعمل في حال فتحه مباشرة عبر file:// أو عدم وجود الملفات.
    // عند الاستضافة أو التشغيل عبر Python/Live Server سيُستخدم JSON بشكل طبيعي.
    students1 = [];
    students2 = [];
    students3 = [];
    rebuildStudentRecords();
    return false;
  }
}

function saveConfigToStorage() {
  localStorage.setItem("universitySiteConfig", JSON.stringify(siteConfig));
  window.dispatchEvent(new CustomEvent("site-config-updated", { detail: { ...siteConfig } }));
}

function saveNotificationsToStorage() {
  localStorage.setItem("universityNotifications", JSON.stringify(notifications));
  window.dispatchEvent(new CustomEvent("notifications-updated", { detail: notifications.slice() }));
}

function subjectName(key) {
  return SUBJECT_NAME_BY_KEY[key] || key;
}
