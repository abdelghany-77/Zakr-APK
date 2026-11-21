# دليل النشر على Google Play Store — تطبيق ذَكِّرْ (v2.2.0)

تم تهيئة التطبيق بالكامل ليكون متوافقاً مع سياسات Google Play Store (API 35 / Android 15، أذونات غير مقيدة، سياسة خصوصية داخل التطبيق وخارجه، ودعم جميع أحجام الشاشات والاتجاهات).

---

## 1. إنشاء مفتاح التوقيع (Release Keystore) — مرة واحدة فقط

شغّل الأمر التالي على جهازك (احتفظ بالملف وكلمات المرور في مكان آمن ولا ترفعه إلى Git أبداً):

```bash
keytool -genkey -v \
  -keystore android/app/tazkeer-release.jks \
  -alias tazkeer \
  -keyalg RSA -keysize 2048 -validity 10000
```

ثم أنشئ الملف `android/keystore.properties` (مضاف تلقائياً في `.gitignore` فلا يُرفع إلى Git):

```properties
storeFile=tazkeer-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=tazkeer
keyPassword=YOUR_KEY_PASSWORD
```

---

## 2. بناء حزمة النشر (.aab) لـ Google Play

```bash
npm test
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
```

ستجد الملف الجاهز للرفع في:
`android/app/build/outputs/bundle/release/app-release.aab`

> **ملاحظة:** تم ضبط `compileSdkVersion = 35` و `targetSdkVersion = 35` و `versionCode = 4` و `versionName = "2.2.0"` مع تفعيل `minifyEnabled = true` و `shrinkResources = true` والحفاظ على الموارد العربية داخل حزمة AAB (`enableSplit = false`).

---

## 3. إعدادات Google Play Console (النماذج المطلوبة)

### أ) رابط سياسة الخصوصية (Privacy Policy URL)
ارفع المشروع إلى GitHub Pages واستخدم الرابط:
`https://abdelghany-77.github.io/tazkeer/privacy-policy.html`
(كما تم تضمين سياسة الخصوصية داخل التطبيق في تبويب **الملف الشخصي ← سياسة الخصوصية وحول التطبيق**).

### ب) نموذج أمان البيانات (Data Safety Form)
- **هل يجمع التطبيق بيانات مستخدمين أو يشاركها؟** → **نعم (الموقع التقريبي/الدقيق اختيارياً فقط عند التفعيل)**
  - **Location (Approximate / Precise):**
    - *Collected:* نعم (اختياري، يُرسل مؤقتاً لـ AlAdhan API لجلب مواقيت الصلاة).
    - *Shared with third parties:* لا (يُستخدم فقط كمعامل طلب لجلب أوقات الصلاة ولا يُباع أو يُستخدم للإعلانات).
    - *Processed ephemerally:* نعم (لا يُحفظ على أي خوادم خاصة بالمطور).
    - *Optional for user:* نعم (يمكن اختيار المدينة يدوياً بدون GPS).
    - *Purpose:* App functionality (مواقيت الصلاة واتجاه القبلة).
- **Encrypted in transit:** نعم (HTTPS فقط، `cleartextTrafficPermitted="false"`).
- **حسابات / إعلانات / تتبع:** لا يوجد أي حسابات ولا إعلانات ولا SDKs للتتبع.

### ج) إقرار الأذونات الحساسة (App Content → Permissions)
- **`SCHEDULE_EXACT_ALARM`:**
  - *التبرير:* التطبيق تطبيق إسلامي لمواقيت الصلاة والأذان، ويحتاج المستخدم إلى تنبيهات الأذان في الدقيقة والثانية الدقيقة لوقت الصلاة. (تمت إزالة `USE_EXACT_ALARM` و `USE_FULL_SCREEN_INTENT` و `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` بالكامل لتجنب أي رفض).
- **`FOREGROUND_SERVICE_MEDIA_PLAYBACK`:**
  - *التبرير:* يُستخدم حصراً لتشغيل صوت الأذان عبر مسار المنبه (`USAGE_ALARM`) مع إشعار ظاهر يحتوي على زر "إيقاف الأذان" ليتحكم المستخدم بالصوت في أي لحظة.
  - *فيديو توضيحي قصير (اختياري عند الطلب):* افتح الإعدادات ← اضغط "تجربة الأذان" ← أظهر الإشعار الظاهر مع زر "إيقاف الأذان".

### د) التصنيف العمري والجمهور المستهدف
- **Content Rating (IARC):** مناسب للجميع (Everyone / PEGI 3).
- **Ads:** No, my app does not contain ads.
- **Target Audience:** 13+ أو الجميع (لا يجمع بيانات أطفال).
