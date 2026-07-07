"""
bobo - تطبيق وسائط اجتماعية
نقطة الدخول الرئيسية للخادم: Flask + Flask-SocketIO + SQLAlchemy
"""
import os
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
import os
import uuid
from functools import wraps

from flask import Flask, jsonify, render_template, request, session, redirect, url_for, Blueprint
from werkzeug.utils import secure_filename

from config import Config
from models import db, User, Post, Like, Comment, Story, Conversation, Message, Reel, ReelLike, ReelComment
from auth import auth_bp, init_oauth, current_user
from sockets import (
    socketio, broadcast_new_post, broadcast_new_comment, broadcast_like_update,
    broadcast_new_reel, broadcast_reel_like_update, broadcast_new_reel_comment,
)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}
views_bp = Blueprint("views", __name__)


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    init_oauth(app)
    socketio.init_app(app)
    app.register_blueprint(auth_bp)
    app.register_blueprint(views_bp)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    with app.app_context():
        db.create_all()  # ينشئ الجداول تلقائيًا إذا ما كانت موجودة (قاعدة بيانات فارغة)

    register_api_routes(app)

    return app


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "يجب تسجيل الدخول"}), 401
        return f(*args, **kwargs)
    return wrapper


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def allowed_video_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS


# =====================================================================
# صفحات الواجهة (Views)
# =====================================================================
@views_bp.route("/")
def index():
    if session.get("user_id"):
        return redirect(url_for("views.feed_page"))
    return redirect(url_for("views.login_page"))


@views_bp.route("/login")
def login_page():
    from flask import current_app
    if session.get("user_id"):
        return redirect(url_for("views.feed_page"))
    return render_template("login.html", google_enabled=current_app.config["GOOGLE_OAUTH_ENABLED"])


@views_bp.route("/feed")
def feed_page():
    user = current_user()
    if not user:
        return redirect(url_for("views.login_page"))
    return render_template("feed.html", user=user.to_dict())


@views_bp.route("/messenger")
def messenger_page():
    user = current_user()
    if not user:
        return redirect(url_for("views.login_page"))
    return render_template("messenger.html", user=user.to_dict())


@views_bp.route("/reels")
def reels_page():
    user = current_user()
    if not user:
        return redirect(url_for("views.login_page"))
    return render_template("reels.html", user=user.to_dict())


# =====================================================================
# REST API
# =====================================================================
def register_api_routes(app):

    @app.route("/api/me")
    def api_me():
        user = current_user()
        if not user:
            return jsonify({"error": "غير مسجل دخول"}), 401
        return jsonify({"user": user.to_dict()})

    # -------------------- المنشورات (Posts) --------------------
    @app.route("/api/posts", methods=["GET"])
    @login_required
    def get_posts():
        page = int(request.args.get("page", 1))
        per_page = 10
        posts = (
            Post.query.order_by(Post.created_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        uid = session["user_id"]
        return jsonify({
            "posts": [p.to_dict(current_user_id=uid) for p in posts.items],
            "has_next": posts.has_next,
        })

    @app.route("/api/posts", methods=["POST"])
    @login_required
    def create_post():
        content = request.form.get("content", "").strip()
        image_file = request.files.get("image")
        image_url = None

        if image_file and image_file.filename and allowed_file(image_file.filename):
            filename = f"{uuid.uuid4().hex}_{secure_filename(image_file.filename)}"
            image_file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
            image_url = f"/static/uploads/{filename}"

        if not content and not image_url:
            return jsonify({"error": "المنشور فارغ"}), 400

        post = Post(user_id=session["user_id"], content=content, image_url=image_url)
        db.session.add(post)
        db.session.commit()

        post_dict = post.to_dict(current_user_id=session["user_id"])
        broadcast_new_post(post_dict)  # يبث المنشور لحظيًا لكل المستخدمين
        return jsonify({"post": post_dict}), 201

    @app.route("/api/posts/<int:post_id>/like", methods=["POST"])
    @login_required
    def toggle_like(post_id):
        post = Post.query.get_or_404(post_id)
        uid = session["user_id"]
        like = Like.query.filter_by(post_id=post_id, user_id=uid).first()

        if like:
            db.session.delete(like)
            liked = False
        else:
            db.session.add(Like(post_id=post_id, user_id=uid))
            liked = True

        db.session.commit()
        likes_count = post.likes.count()
        broadcast_like_update(post_id, likes_count)
        return jsonify({"liked": liked, "likes_count": likes_count})

    @app.route("/api/posts/<int:post_id>/comments", methods=["GET"])
    @login_required
    def get_comments(post_id):
        comments = Comment.query.filter_by(post_id=post_id).order_by(Comment.created_at.asc()).all()
        return jsonify({"comments": [c.to_dict() for c in comments]})

    @app.route("/api/posts/<int:post_id>/comments", methods=["POST"])
    @login_required
    def add_comment(post_id):
        Post.query.get_or_404(post_id)
        content = (request.get_json(force=True).get("content") or "").strip()
        if not content:
            return jsonify({"error": "التعليق فارغ"}), 400

        comment = Comment(post_id=post_id, user_id=session["user_id"], content=content)
        db.session.add(comment)
        db.session.commit()

        comment_dict = comment.to_dict()
        broadcast_new_comment(post_id, comment_dict)
        return jsonify({"comment": comment_dict}), 201

    # -------------------- القصص (Stories) --------------------
    @app.route("/api/stories", methods=["GET"])
    @login_required
    def get_stories():
        stories = Story.query.order_by(Story.created_at.desc()).all()
        return jsonify({"stories": [s.to_dict() for s in stories]})

    @app.route("/api/stories", methods=["POST"])
    @login_required
    def create_story():
        image_file = request.files.get("image")
        if not image_file or not allowed_file(image_file.filename):
            return jsonify({"error": "صورة غير صالحة"}), 400

        filename = f"{uuid.uuid4().hex}_{secure_filename(image_file.filename)}"
        image_file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))

        story = Story(user_id=session["user_id"], image_url=f"/static/uploads/{filename}")
        db.session.add(story)
        db.session.commit()
        return jsonify({"story": story.to_dict()}), 201

    # -------------------- الفيديوهات القصيرة (Reels) --------------------
    @app.route("/api/reels", methods=["GET"])
    @login_required
    def get_reels():
        page = int(request.args.get("page", 1))
        per_page = 6
        reels = (
            Reel.query.order_by(Reel.created_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        uid = session["user_id"]
        return jsonify({
            "reels": [r.to_dict(current_user_id=uid) for r in reels.items],
            "has_next": reels.has_next,
        })

    @app.route("/api/reels", methods=["POST"])
    @login_required
    def create_reel():
        caption = request.form.get("caption", "").strip()
        video_file = request.files.get("video")

        if not video_file or not video_file.filename or not allowed_video_file(video_file.filename):
            return jsonify({"error": "يجب رفع ملف فيديو صالح (mp4, webm, mov)"}), 400

        filename = f"{uuid.uuid4().hex}_{secure_filename(video_file.filename)}"
        video_file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
        video_url = f"/static/uploads/{filename}"

        reel = Reel(user_id=session["user_id"], video_url=video_url, caption=caption)
        db.session.add(reel)
        db.session.commit()

        reel_dict = reel.to_dict(current_user_id=session["user_id"])
        broadcast_new_reel(reel_dict)
        return jsonify({"reel": reel_dict}), 201

    @app.route("/api/reels/<int:reel_id>/like", methods=["POST"])
    @login_required
    def toggle_reel_like(reel_id):
        reel = Reel.query.get_or_404(reel_id)
        uid = session["user_id"]
        like = ReelLike.query.filter_by(reel_id=reel_id, user_id=uid).first()

        if like:
            db.session.delete(like)
            liked = False
        else:
            db.session.add(ReelLike(reel_id=reel_id, user_id=uid))
            liked = True

        db.session.commit()
        likes_count = reel.likes.count()
        broadcast_reel_like_update(reel_id, likes_count)
        return jsonify({"liked": liked, "likes_count": likes_count})

    @app.route("/api/reels/<int:reel_id>/comments", methods=["GET"])
    @login_required
    def get_reel_comments(reel_id):
        comments = ReelComment.query.filter_by(reel_id=reel_id).order_by(ReelComment.created_at.asc()).all()
        return jsonify({"comments": [c.to_dict() for c in comments]})

    @app.route("/api/reels/<int:reel_id>/comments", methods=["POST"])
    @login_required
    def add_reel_comment(reel_id):
        Reel.query.get_or_404(reel_id)
        content = (request.get_json(force=True).get("content") or "").strip()
        if not content:
            return jsonify({"error": "التعليق فارغ"}), 400

        comment = ReelComment(reel_id=reel_id, user_id=session["user_id"], content=content)
        db.session.add(comment)
        db.session.commit()

        comment_dict = comment.to_dict()
        broadcast_new_reel_comment(reel_id, comment_dict)
        return jsonify({"comment": comment_dict}), 201

    # -------------------- المستخدمون (Users) --------------------
    @app.route("/api/users/search")
    @login_required
    def search_users():
        q = request.args.get("q", "").strip()
        uid = session["user_id"]
        query = User.query.filter(User.id != uid)
        if q:
            query = query.filter(User.name.ilike(f"%{q}%"))
        users = query.limit(20).all()
        return jsonify({"users": [u.to_dict() for u in users]})

    @app.route("/api/users/online")
    @login_required
    def online_users():
        uid = session["user_id"]
        users = User.query.filter(User.id != uid, User.is_online == True).all()  # noqa: E712
        return jsonify({"users": [u.to_dict() for u in users]})

    # -------------------- المحادثات (Conversations) --------------------
    @app.route("/api/conversations", methods=["GET"])
    @login_required
    def get_conversations():
        uid = session["user_id"]
        convs = Conversation.query.filter(
            (Conversation.user1_id == uid) | (Conversation.user2_id == uid)
        ).all()
        data = [c.to_dict(uid) for c in convs]
        data.sort(key=lambda c: c["last_message_at"] or "", reverse=True)
        return jsonify({"conversations": data})

    @app.route("/api/conversations", methods=["POST"])
    @login_required
    def start_conversation():
        uid = session["user_id"]
        other_id = request.get_json(force=True).get("user_id")
        if not other_id or int(other_id) == uid:
            return jsonify({"error": "مستخدم غير صالح"}), 400

        existing = Conversation.query.filter(
            ((Conversation.user1_id == uid) & (Conversation.user2_id == other_id))
            | ((Conversation.user1_id == other_id) & (Conversation.user2_id == uid))
        ).first()

        if existing:
            return jsonify({"conversation": existing.to_dict(uid)})

        conv = Conversation(user1_id=uid, user2_id=other_id)
        db.session.add(conv)
        db.session.commit()
        return jsonify({"conversation": conv.to_dict(uid)}), 201

    @app.route("/api/conversations/<int:conv_id>/messages", methods=["GET"])
    @login_required
    def get_messages(conv_id):
        uid = session["user_id"]
        conv = Conversation.query.get_or_404(conv_id)
        if uid not in (conv.user1_id, conv.user2_id):
            return jsonify({"error": "غير مصرح"}), 403
        messages = conv.messages.order_by(Message.created_at.asc()).all()
        return jsonify({
            "messages": [m.to_dict() for m in messages],
            "other_user": conv.other_user(uid).to_dict(),
        })


app = create_app()

if __name__ == "__main__":
    print("=" * 60)
    print("🫧  bobo يعمل الآن على: http://localhost:5000")
    print("=" * 60)
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
