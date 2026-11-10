# دليل بناء واستخدام تطبيق أندرويد — ذَكِّرْ (Capacitor)

هذا الدليل يشرح تجهيز بيئة البناء، إنتاج APK/AAB، التحقق من عمل الأذان الأصلي،
وحل مشاكل الشركات المصنّعة (Xiaomi / Huawei / Samsung / Oppo / Vivo).

- معرّف التطبيق: `com.abdelghany.tazkeer`
- الإصدار: `2.0.0` (versionCode `2`)
- Capacitor: `6.2.1`
- compileSdk / targetSdk: `34`
- minSdk: `22` (Android 5.1)
- مجلد أصول الويب: `www/` (يُبنى آلياً من ملفات الجذر)

---

## 1. المتطلبات

| المتطلب | الإصدار | ملاحظات |
| --- | --- | --- |
| Node.js | 18+ | تم الاختبار على `v22.13.1` |
| JDK | **17** | مطلوب لـ AGP 8.2.1. JDK 21 قد يعمل لكن JDK 17 هو المسار المدعوم |
| Android SDK Platform | **34** | `platforms;android-34` |
| Android Build-Tools | **34.0.0** | `build-tools;34.0.0` |
| Android Platform-Tools | أحدث إصدار | للـ `adb` |
| Android Studio | اختياري | أسهل طريقة لإدارة SDK والتوقيع |

### ضبط متغيرات البيئة (Windows PowerShell)

```powershell
# عدّل المسارات حسب جهازك
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

java -version
adb version
```

> على جهاز هذا المشروع المسارات هي: `JAVA_HOME=D:\AndroidToolchain\jdk-17.0.20.1+1`
> و`SDK=D:\AndroidToolchain\sdk` (مضبوط مسبقًا في `android/local.properties`).
> إن ظهر `JAVA_HOME is not set` فالمشكلة أن المتغيّر غير مُصدَّر في الجلسة الحالية فقط.

أو أنشئ `android/local.properties` (لا يُرفع إلى Git):

```properties
sdk.dir=C:/Users/<USER>/AppData/Local/Android/Sdk
```

> لا تضع مسار SDK داخل مجلد باسم عربي أو به مسافات معقّدة إن أمكن؛ بعض أدوات
> Android القديمة تتعامل معه بشكل سيئ.

---

## 2. أوامر البناء

من جذر المشروع:

```powershell
npm install          # مرة واحدة
npm run sync         # يبني www/ ثم npx cap sync android
npm run open:android # يفتح Android Studio (اختياري)
```

### APK للتجربة (موقّع بمفتاح debug)

```powershell
npm run apk:debug
```

الناتج:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### APK للإصدار

```powershell
npm run apk:release
```

الناتج:

```
android/app/build/outputs/apk/release/app-release.apk
```

> بدون إعداد توقيع، سينتج Gradle ملف APK **غير موقّع** (أو يفشل في نسخه).
> راجع قسم التوقيع أدناه.

### حزمة Google Play (AAB)

```powershell
npm run bundle:release
```

الناتج:

```
android/app/build/outputs/bundle/release/app-release.aab
```

### تثبيت مباشر على جهاز موصول

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 3. توقيع الإصدار

### أ) إنشاء مفتاح (مرة واحدة فقط — احتفظ به واحتفظ بكلمة مروره)

```powershell
keytool -genkeypair -v -keystore tazkeer-release.jks `
  -alias tazkeer -keyalg RSA -keysize 2048 -validity 10000 `
  -storetype JKS
```

### ب) إخبار Gradle بالمفتاح

أضف إلى `android/key.properties` (لا ترفعه إلى Git):

```properties
storeFile=../../tazkeer-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=tazkeer
keyPassword=YOUR_KEY_PASSWORD
```

ثم في `android/app/build.gradle` داخل `android { ... }`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties["storeFile"])
                storePassword keystoreProperties["storePassword"]
                keyAlias keystoreProperties["keyAlias"]
                keyPassword keystoreProperties["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### ج) بناء موقّع والتحقق

```powershell
npm run apk:release
& "$env:ANDROID_HOME\build-tools\34.0.0\apksigner.bat" verify --verbose `
  android\app\build\outputs\apk\release\app-release.apk
```

---

## 4. كيف يعمل الأذان الأصلي؟

```
JS (adhan-native.js)
  └─ 7 أيام × 5 صلوات  →  AdhanScheduler.scheduleAlarms
                                │
                    AdhanAlarmManager (Java)
                    AlarmManager.setAlarmClock()
                                │  في الثانية المحددة
                    AdhanAlarmReceiver (BroadcastReceiver)
                                │
                    AdhanPlaybackService (Foreground Service)
                    MediaPlayer + STREAM_ALARM + PARTIAL_WAKE_LOCK
```

المكوّنات الأساسية:

| الملف | الدور |
| --- | --- |
| `AdhanSchedulerPlugin.java` | جسر Capacitor وكل دوال JS |
| `AdhanAlarmManager.java` | جدولة `setAlarmClock` + حفظ الجدول في SharedPreferences |
| `AdhanAlarmReceiver.java` | يستقبل المنبّه ويشغّل الخدمة |
| `AdhanBootReceiver.java` | يعيد الجدولة بعد إعادة التشغيل/تغيير الوقت/المنطقة الزمنية/تحديث التطبيق |
| `AdhanPlaybackService.java` | تشغيل MP3 كخدمة أمامية مع Wake Lock وإشعار إيقاف |
| `js/native/adhan-native.js` | جلب مواقيت AlAdhan، بناء الجدول، واجهة الإعدادات والتشخيص |

### لماذا يعمل والتطبيق مغلق؟

- `setAlarmClock()` من أقوى أنواع المنبّهات: دقيق بالثانية، يعمل في Doze،
  ولا يتأثر بحدود تشغيل الخدمات من الخلفية على Android 12+.
- الخدمة الأمامية (`mediaPlayback`) + `PARTIAL_WAKE_LOCK` تُبقي المعالج مستيقظاً
  حتى ينتهي فك ترميز الصوت.
- الجدول محفوظ أصلاً، لذا يعيد `BOOT_COMPLETED` / `TIME_SET` بناؤه تلقائياً.

### حدود معروفة

- الجدول **7 أيام متجددة**. إذا لم يفتح المستخدم التطبيق ولا يوجد اتصال لمدة
  تتجاوز آخر موعد محفوظ، تتوقف المواعيد حتى الفتح التالي. افتح التطبيق مرة كل
  بضعة أيام (أو وصّله بالإنترنت) لتجديد النافذة.
- إذا Force-stop المستخدم التطبيق من إعدادات النظام، لا تصل `BOOT_COMPLETED`
  حتى يفتحه مرة أخرى.
- بعض شركات التصنيع تقتل الخدمات بقوة بغض النظر عن الاستثناءات — راجع القسم 6.

---

## 5. التحقق من العمل (Checklist)

### أ) فحص المنبّهات المسجّلة

```powershell
adb shell dumpsys alarm | Select-String "com.abdelghany.tazkeer"
```

يجب أن ترى منبّهات من نوع `alarmClock` بأوقات الصلوات.

### ب) فحص الأذونات من داخل التطبيق

افتح شاشة الأذان وتأكد من أن الشارات الثلاث خضراء:

1. إذن الإشعارات
2. المنبهات الدقيقة (`Alarms & reminders`)
3. استثناء تحسين البطارية

### ج) تجربة الأذان

اضغط **تجربة الأذان** → سيُشغَّل بعد 10 ثوانٍ. اقفل الشاشة أو أغلق التطبيق
(اسحبه من قائمة التطبيقات) وتأكد من استمرار الصوت وظهور إشعار «إيقاف الأذان».

### د) السجلات

```powershell
adb logcat -s TazkeerAdhan
```

رسائل متوقعة عند النجاح:

```
Adhan alarm received: Fajr
Adhan playback completed
Scheduled 35/35 adhan alarms
```

### هـ) اختبار إعادة التشغيل

1. فعّل الأذان وانتظر ظهور «مفعّل · N موعد».
2. أعد تشغيل الهاتف.
3. بعد فتح الشاشة، نفّذ `adb shell dumpsys alarm | Select-String tazkeer` وتأكد
   من عودة المنبّهات.

### و) اختبار تغيير المنطقة الزمنية (اختياري)

غيّر المنطقة الزمنية من إعدادات الهاتف ثم افتح التطبيق. يعيد
`AdhanBootReceiver` حساب التوقيت من `date + timeOfDay` المحفوظين، ثم يعيد
`script.js` جلب المواقيت الصحيحة للموقع عند الفتح.

---

## 6. حل مشاكل الشركات المصنّعة (Battery killers)

التطبيق يطلب استثناء تحسين البطارية، لكن بعض الشركات تحتاج خطوات إضافية:

### Xiaomi / Redmi / POCO (MIUI / HyperOS)

1. الإعدادات → التطبيقات → إدارة التطبيقات → ذَكِّرْ.
2. **Autostart**: مفعّل.
3. **Battery saver**: `No restrictions`.
4. **Other permissions** → `Display pop-up windows while running in background`: مسموح.
5. قفل التطبيق في شاشة التطبيقات الأخيرة (اسحب للأسفل واضغط القفل).

### Huawei / Honor (EMUI / MagicOS)

1. الإعدادات → البطارية → **App launch** → ذَكِّرْ → إدارة يدوية.
2. فعّل: Auto-launch، Secondary launch، Run in background.
3. الإعدادات → التطبيقات → ذَكِّرْ → استهلاك الطاقة → إدارة يدوية → كل الخيارات.

### Samsung (One UI)

1. الإعدادات → العناية بالجهاز (Battery) → **Background usage limits**.
2. أضف ذَكِّرْ إلى **Never sleeping apps**.
3. أزل التطبيق من **Sleeping apps** / **Deep sleeping apps**.
4. الإعدادات → التطبيقات → ذَكِّرْ → البطارية → `Unrestricted`.

### Oppo / Realme / OnePlus (ColorOS / OxygenOS)

1. الإعدادات → البطارية → **Optimize battery use** → ذَكِّرْ → `Don't optimize`.
2. **App launch** → إدارة يدوية: Auto-launch + Run in background + Allow background activity.
3. اقفل التطبيق في Recent apps.

### Vivo / iQOO (FuntouchOS / OriginOS)

1. i Manager → App manager → Autostart manager → ذَكِّرْ.
2. الإعدادات → البطارية → استهلاك الطاقة الخلفي → مسموح.
3. الإعدادات → التطبيقات → ذَكِّرْ → البطارية → `High background power consumption`.

### نصائح عامة

- أبقِ التطبيق في قائمة **Non-optimized**.
- اسمح بالإشعارات وعدم إخفائها على شاشة القفل.
- لا تستخدم «Force stop» من الإعدادات.
- بعد تحديث النظام، أعد التحقق من الأذونات.

---

## 7. متطلبات Google Play

| البند | ملاحظة |
| --- | --- |
| `USE_EXACT_ALARM` | مقيّد لتطبيقات المنبّه/التقويم. تطبيق مواقيت الصلاة قد يحتاج إقراراً في Play Console. البديل: إزالة `USE_EXACT_ALARM` والاعتماد على `SCHEDULE_EXACT_ALARM` + مطالبة المستخدم. |
| `SCHEDULE_EXACT_ALARM` | يتطلب إفصاحاً عن الاستخدام في Play Console. |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | يتطلب وصفاً واضحاً لسبب الخدمة الأمامية. |
| `POST_NOTIFICATIONS` | إذن وقت التشغيل (Android 13+). |
| `USE_FULL_SCREEN_INTENT` | على Android 14+ قد يحتاج مراجعة؛ التطبيق يعمل بدونه (إشعار عادي). |
| سياسة الصوت | راجع `AUDIO-NOTICE.md` وتأكد من حقوق التسجيلات قبل النشر التجاري. |
| Data safety | التطبيق يستخدم الموقع (اختياري) وجلب مواقيت من `api.aladhan.com`. |

توصية: أبقِ `webContentsDebuggingEnabled` بقيمة `false` في نسخة الإصدار
(القيمة الحالية `false` في `capacitor.config.json`). فعّلها مؤقتاً فقط عند
تشخيص مشاكل WebView.

---

## 8. استكشاف أخطاء البناء

| الخطأ | الحل |
| --- | --- |
| `JAVA_HOME is not set` / `Unsupported class file major version` | ثبّت JDK 17 واضبط `JAVA_HOME`، ثم `./gradlew --stop`. |
| `SDK location not found` | أنشئ `android/local.properties` أو اضبط `ANDROID_HOME`. |
| `Failed to find target with hash string 'android-34'` | `sdkmanager "platforms;android-34" "build-tools;34.0.0"`. |
| `Failed to install the following Android SDK packages ... licenses` | `sdkmanager --licenses` واقبل الكل. |
| `Namespace not specified` | تأكد من `namespace "com.abdelghany.tazkeer"` في `android/app/build.gradle`. |
| `Execution failed for task ':app:processDebugResources'` | غالباً أيقونة/مورد ناقص؛ راجع `res/raw` و`res/drawable/ic_stat_adhan.xml`. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | احذف النسخة القديمة: `adb uninstall com.abdelghany.tazkeer`. |
| التطبيق يفتح شاشة بيضاء | `adb logcat` وابحث عن `Capacitor`; تأكد أن `www/index.html` موجود بعد `npm run sync`. |
| الأذان لا يعمل بعد القفل | راجع الشارات الثلاث + خطوات OEM + `dumpsys deviceidle whitelist`. |

### إعادة بناء نظيفة

```powershell
cd android
.\gradlew.bat clean
cd ..
npm run sync
npm run apk:debug
```

---

## 9. بنية المشروع

```
Tazkeer APK/
├─ index.html, styles.css, script.js, ...   # تطبيق الويب الأصلي (GitHub Pages)
├─ adhan-native.css                         # تنسيق شاشة الأذان + قفل التكبير
├─ css/
│  ├─ tokens.css                            # ألوان/thèmes الجديدة (--pt-*)
│  ├─ base.css, components.css              # الهيكل والمكوّنات المشتركة
│  └─ pages/                                # home, azkar, quran, prophets,
│                                           # profile, settings-modal
├─ images/pattern.svg                       # زخرفة البطاقات (نقش إسلامي)
├─ js/native/adhan-native.js                # جسر Capacitor وجدولة الأذان
├─ scripts/prepare-www.mjs                  # ينسخ أصول الويب إلى www/
├─ www/                                     # ناتج البناء (يُنسخ إلى أندرويد)
├─ capacitor.config.json
├─ AUDIO-NOTICE.md
├─ CAPACITOR-SETUP.md                       # هذا الملف
└─ android/
   └─ app/src/main/
      ├─ AndroidManifest.xml
      ├─ java/com/abdelghany/tazkeer/
      │  ├─ MainActivity.java
      │  └─ adhan/*.java
      └─ res/
         ├─ raw/adhan*.mp3
         └─ drawable/ic_stat_adhan.xml
```

> **مهم:** أي مجلد جديد يُضاف إلى أصول الويب يجب إضافته إلى `DIRECTORIES`
> داخل `scripts/prepare-www.mjs`، وإلا لن يظهر داخل `www/` ثم داخل الـ APK.
> مجلد `css/` مضاف بالفعل. عند تعديل التنسيقات أو المكوّنات، ارفع
> `CACHE_NAME` في `sw.js` (الإصدار الحالي: `tazkeer-v11.0.0`) حتى يُحدَّث
> الكاش على الأجهزة.

> `npx cap sync android` يستبدل `android/app/src/main/assets/public` فقط،
> ولا يمس `res/raw` أو ملفات Java.
