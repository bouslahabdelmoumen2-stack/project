"""
المصادقة (Authentication)
يحتوي على مسارين للدخول:
  1) mock login  -> للتجربة الفورية بدون أي إعداد خارجي
  2) Google OAuth -> يعمل تلقائيًا بمجرد وضع GOOGLE_CLIENT_ID/SECRET في .env
"""
import random
from datetime import datetime

from flask import Blueprint, current_app, jsonify, redirect, request, session, url_for
from authlib.integrations.flask_client import OAuth

from models import db, User

auth_bp = Blueprint("auth", __name__)
oauth = OAuth()

# ألوان أفاتار عشوائية لمستخدمي mock login (بدون صورة بروفايل حقيقية)
AVATAR_COLORS = ["#F2B705", "#FF6B9D", "#7C6EF2", "#38D9A9", "#FF9F43", "#4CC9F0"]


def init_oauth(app):
    """يهيّئ Authlib فقط إذا كانت مفاتيح Google موجودة في .env"""
    oauth.init_app(app)
    if app.config["GOOGLE_OAUTH_ENABLED"]:
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url=app.config["GOOGLE_DISCOVERY_URL"],
            client_kwargs={"scope": "openid email profile"},
        )


# ---------------------------------------------------------------
# Mock Login - تسجيل دخول تجريبي فوري بدون Google
# ---------------------------------------------------------------
@auth_bp.route("/auth/mock-login", methods=["POST"])
def mock_login():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "الاسم مطلوب"}), 400

    # إذا المستخدم موجود مسبقًا بنفس الاسم (تجريبي)، يعيد استخدامه
    user = User.query.filter_by(name=name, google_id=None).first()
    if not user:
        user = User(
            name=name,
            avatar_color=random.choice(AVATAR_COLORS),
        )
        db.session.add(user)
        db.session.commit()

    session["user_id"] = user.id
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.session.commit()

    return jsonify({"user": user.to_dict()})


# ---------------------------------------------------------------
# Google OAuth 2.0
# ---------------------------------------------------------------
@auth_bp.route("/auth/google/login")
def google_login():
    if not current_app.config["GOOGLE_OAUTH_ENABLED"]:
        return jsonify({"error": "Google OAuth غير مُفعّل. أضف المفاتيح في .env"}), 400
    redirect_uri = url_for("auth.google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route("/auth/google/callback")
def google_callback():
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo")
    if not userinfo:
        return redirect(url_for("views.login_page"))

    google_id = userinfo["sub"]
    user = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User(
            google_id=google_id,
            email=userinfo.get("email"),
            name=userinfo.get("name", "مستخدم بدون اسم"),
            avatar_url=userinfo.get("picture"),
        )
        db.session.add(user)
    else:
        user.name = userinfo.get("name", user.name)
        user.avatar_url = userinfo.get("picture", user.avatar_url)

    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.session.commit()

    session["user_id"] = user.id
    return redirect(url_for("views.feed_page"))


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    user_id = session.get("user_id")
    if user_id:
        user = User.query.get(user_id)
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.session.commit()
    session.clear()
    return jsonify({"ok": True})


def current_user():
    """يرجع المستخدم الحالي من الجلسة، أو None."""
    user_id = session.get("user_id")
    if not user_id:
        return None
    return User.query.get(user_id)
