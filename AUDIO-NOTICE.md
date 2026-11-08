# إشعار حقوق الصوت — Adhan Audio Notice

تطبيق **ذَكِّرْ** يضمّن أربعة تسجيلات أذان داخل `android/app/src/main/res/raw/`
حتى يعمل الأذان بدون إنترنت. هذا الملف يوثّق مصدر كل ملف وحالته القانونية.

> **ملاحظة مهمة:** الترخيص المذكور أدناه هو الترخيص الذي أعلنه رافع الملف على
> Internet Archive (Public Domain Mark 1.0). هذا الترخيص لا ينقل بالضرورة حقوق
> التسجيل الأصلي أو حقوق المؤذن/القارئ. قبل النشر على Google Play أو أي متجر
> تجاري، راجع حقوق كل تسجيل أو استبدله بتسجيل تملك حقوق استخدامه تجارياً.

---

## الملفات المضمّنة

| ملف التطبيق | مدة تقريبية | المصدر (Internet Archive) | الترخيص المعلن |
| --- | --- | --- | --- |
| `adhan.mp3` | 2:59 | [Adhan Recordings from Doha, Qatar](https://archive.org/details/adhan.recordings.from.doha.qatar) — الملف `Adhan_Doha_Qatar_02_Dhuhr_Adhan.mp3` | [Public Domain Mark 1.0](http://creativecommons.org/publicdomain/mark/1.0/) |
| `adhan_fajr.mp3` | 3:35 | [Azaan of World Mosques — Islamic Call to Prayer](https://archive.org/details/azaan-of-world-mosques_202608) — الملف `2nd Fajr Haram Makkah best.mp3` | [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) |
| `adhan_makkah.mp3` | 3:25 | نفس مصدر الفجر — الملف `1st Haram Makkah best.mp3` | [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) |
| `adhan_abdulbasit.mp3` | 3:21 | نفس مصدر الفجر — الملف `Cairo Abdul Baset.mp3` | [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) |

### بيانات التحقق

| ملف التطبيق | الحجم (بايت) | MD5 للمصدر |
| --- | --- | --- |
| `adhan.mp3` | 2,419,879 | `2608529cce27385a02c3e81d005ca413` |
| `adhan_fajr.mp3` | 2,974,556 | — (مشتق من WMA بواسطة Internet Archive) |
| `adhan_makkah.mp3` | 2,849,591 | `a07bdfef0b7cddbf33c9fc5e08170920` |
| `adhan_abdulbasit.mp3` | 2,759,639 | — (مشتق من WMA بواسطة Internet Archive) |

---

## إضافة صوت مؤذن جديد (مثال: الشيخ مشاري العفاسي)

1. ضع الملف المرخّص في:
   `android/app/src/main/res/raw/adhan_alafasy.mp3`
   - الاسم يجب أن يكون بأحرف إنجليزية صغيرة وأرقام وشرطات سفلية فقط.
2. حدّث `js/native/adhan-native.js` وأضف مدخلاً في `MUEZZINS`:

```js
alafasy: {
  id: "alafasy",
  name: "الشيخ مشاري العفاسي",
  desc: "أذان بصوت الشيخ مشاري العفاسي",
  sound: "adhan_alafasy",
  fajrSound: "adhan_fajr",
  icon: "fa-microphone"
}
```

3. أعد بناء الواجهة ومزامنة Capacitor:

```powershell
npm run sync
npm run apk:debug
```

> لا يتطلب الأمر أي تعديل في Java: اسم الملف في `res/raw` يُمرَّر مباشرة إلى
> `MediaPlayer` عبر `soundRes`.

---

## استبدال ملف موجود

استبدل الملف بنفس الاسم داخل `res/raw`، ثم:

```powershell
npm run build
npx cap copy android
```

لا تحتاج إلى `cap sync` كامل عند تغيير الصوت فقط، لكن `npm run sync` الآمن
يعيد نسخ أصول الويب أيضاً.

---

## صوت الإشعارات

قناة إشعار تشغيل الأذان `adhan_playback_v1` تُنشأ بصوت `null` عمداً. الأذان نفسه
يُشغَّل عبر `MediaPlayer` على مسار `STREAM_ALARM`، لذلك لا يوجد صوت إشعار مزدوج.
