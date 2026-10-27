/* إعدادات دفتر البيت — هذا هو الملف الوحيد الذي تعدّله.
   انسخ القيم من Firebase Console ← Project settings ← Your apps ← SDK setup and configuration (Config). */
window.DAFTAR_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCRjkicp9qCNG_bIudNdsTKCCs3iSQhu4k",
    authDomain: "daftar-albait.firebaseapp.com",
    projectId: "daftar-albait",
    storageBucket: "daftar-albait.firebasestorage.app",
    messagingSenderId: "528413007038",
    appId: "1:528413007038:web:a7b24f3c15e183c025d2ef"
  },

  // مفتاح reCAPTCHA Enterprise لحماية App Check (مطلوب لتشغيل التصنيف الذكي). اتركه فارغاً مؤقتاً إن لم تجهّزه بعد.
  appCheckSiteKey: "",

  // التصنيف الذكي عبر Gemini (Firebase AI Logic). اجعلها false لإيقافه.
  ai: true,
  aiModel: "gemini-3.8-flash",

  // الإدخال الصوتي
  voiceLang: "ar-SA",
  voiceAutoAdd: true,   // يضيف العنصر تلقائياً عند انتهاء الكلام

  sdkVersion: "13.1.0"
};
