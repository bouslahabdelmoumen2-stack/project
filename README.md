# 🫧 bobo — تطبيق تواصل اجتماعي

تطبيق تواصل اجتماعي كامل (Front-end + Back-end) يشبه فيسبوك في الوظائف الأساسية:
خلاصة منشورات (Feed)، قصص (Stories)، إعجابات وتعليقات، ومسنجر دردشة لحظي (Real-time Messenger).

## المكوّنات التقنية

| الطبقة | التقنية |
|---|---|
| Front-end | HTML5 + CSS3 (Dark theme) + Vanilla JavaScript |
| Back-end | Python + Flask |
| الاتصال اللحظي | Flask-SocketIO (WebSockets) |
| قاعدة البيانات | SQLite (عبر SQLAlchemy) — تُنشأ تلقائيًا فارغة عند أول تشغيل |
| تسجيل الدخول | Google OAuth 2.0 (Authlib) + نظام Mock Login تجريبي |

## هيكلة المشروع

```
bobo/
├── app.py              # نقطة الدخول + كل مسارات REST API
├── auth.py             # المصادقة: mock login + Google OAuth
├── sockets.py          # أحداث WebSocket (رسائل، حالة الاتصال)
├── models.py           # نماذج قاعدة البيانات
├── config.py           # الإعدادات (تُقرأ من .env)
├── requirements.txt
├── .env.example        # انسخه إلى .env واملأه
├── static/
│   ├── css/style.css
│   ├── js/socket-client.js
│   ├── js/feed.js
│   ├── js/chat.js
│   ├── js/reels.js
│   └── uploads/        # صور المنشورات والقصص + فيديوهات الريلز المرفوعة
└── templates/
    ├── login.html
    ├── feed.html
    ├── reels.html
    └── messenger.html
```

## خطوات التشغيل

### 1) إنشاء بيئة افتراضية وتثبيت المتطلبات

```bash
cd bobo
python3 -m venv venv
source venv/bin/activate      # على Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2) إعداد ملف البيئة `.env`

```bash
cp .env.example .env
```

افتح `.env` وغيّر `SECRET_KEY` إلى نص عشوائي طويل. يمكنك توليد واحد بسرعة:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3) تشغيل الخادم

```bash
python3 app.py
```

افتح المتصفح على: **http://localhost:5000**

عند أول تشغيل، سيتم إنشاء ملف `bobo.db` (قاعدة بيانات SQLite فارغة تمامًا) تلقائيًا.

### 4) تجربة التطبيق فورًا (بدون Google)

في صفحة تسجيل الدخول، استخدم خانة **"دخول سريع (تجريبي)"** واكتب أي اسم.
لتجربة الدردشة اللحظية بين مستخدمين، افتح التطبيق في تبويبين/متصفحين مختلفين
وسجّل دخول باسمين مختلفين، ثم ابحث عن أحدهما من صفحة المسنجر لبدء محادثة.

---

## تفعيل تسجيل الدخول عبر Google (اختياري)

الخطوات للحصول على `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET`:

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. أنشئ مشروعًا جديدًا (أو اختر مشروعًا موجودًا)
3. من قائمة **APIs & Services → OAuth consent screen**: أعد تهيئة شاشة الموافقة
   (اختر "External" إذا كنت تختبر محليًا)
4. من **Credentials → Create Credentials → OAuth client ID**:
   - نوع التطبيق: **Web application**
   - **Authorized redirect URIs**: أضف بالضبط:
     ```
     http://localhost:5000/auth/google/callback
     ```
5. انسخ **Client ID** و **Client Secret** الناتجين وضعهما في ملف `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxxxxxxxxx
   ```
6. أعد تشغيل الخادم — سيظهر زر "الدخول بحساب Google" مفعّلاً تلقائيًا في صفحة تسجيل الدخول.

> ⚠️ بدون هذه الخطوات، التطبيق يعمل بشكل كامل عبر **Mock Login** فقط، وهذا كافٍ للتجربة والتطوير المحلي.

---

## الميزات المُنفَّذة

**قسم الخلاصة (Feed)**
- شريط علوي: شعار bobo + بحث + زر إنشاء منشور + إشعارات + صورة البروفايل
- شريط قصص أفقي مع حلقة تدرّج لونية وزر "+" لإضافة قصة
- نشر منشورات (نص + صورة) تظهر لحظيًا لكل المستخدمين المتصلين دون تحديث الصفحة
- إعجاب وتعليق لحظي، ومشاركة رابط المنشور
- تحميل تدريجي للمنشورات عند التمرير (Infinite scroll)

**قسم الريلز (Reels) — جديد**
- تبويب "ريلز" في شريط التنقل السفلي
- شاشة فيديوهات قصيرة بتمرير عمودي كامل الشاشة (مثل TikTok/Instagram Reels)
- تشغيل تلقائي للفيديو الظاهر فقط وإيقاف الباقي (عبر IntersectionObserver)
- إعجاب وتعليق لحظي على كل ريلز، زر كتم/تشغيل الصوت
- رفع ريلز جديد (فيديو mp4/webm/mov + وصف نصي) يظهر لحظيًا لكل المستخدمين

**قسم المسنجر (Messenger)**
- رأس "bobo Messenger" + بحث عن مستخدمين لبدء محادثة جديدة
- شريط أفقي للأصدقاء المتصلين حاليًا مع مؤشر أخضر
- قائمة محادثات عمودية: صورة، اسم، آخر رسالة، الوقت، شارة الرسائل غير المقروءة
- شاشة محادثة فردية مع إرسال/استقبال لحظي، مؤشر "يكتب الآن..."، وتحديث حالة القراءة

**عام**
- تصميم داكن فاخر (Dark Premium) بهوية بصرية مخصصة لـ bobo
- بنية قابلة للتوسعة (يمكن الترقية إلى PostgreSQL لاحقًا بتغيير `DATABASE_URL` فقط)

## ملاحظات للتطوير المستقبلي

- لدعم الإنتاج الفعلي، استبدل خادم التطوير بـ `gunicorn` مع `eventlet` worker:
  ```bash
  gunicorn --worker-class eventlet -w 1 app:app
  ```
- للتوسع الأفقي (أكثر من خادم واحد)، استخدم Redis كـ message queue لـ Flask-SocketIO
  (`socketio = SocketIO(message_queue="redis://...")`).
- الصور تُحفظ محليًا في `static/uploads` — للإنتاج يُفضّل استخدام تخزين سحابي (S3 مثلاً).
