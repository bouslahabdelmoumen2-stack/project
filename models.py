"""
نماذج قاعدة البيانات (SQLAlchemy Models)
كل الجداول التي يحتاجها تطبيق bobo: المستخدمين، المنشورات، الإعجابات،
التعليقات، القصص، المحادثات، والرسائل.
"""
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    # google_id يبقى فارغ إذا سجل المستخدم عبر mock login
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=True)
    name = db.Column(db.String(120), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)
    avatar_color = db.Column(db.String(20), default="#F2B705")  # لون الأفاتار الافتراضي (mock users)
    is_online = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    posts = db.relationship("Post", backref="author", lazy="dynamic", cascade="all, delete-orphan")
    stories = db.relationship("Story", backref="author", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "avatar_color": self.avatar_color,
            "is_online": self.is_online,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
        }


class Post(db.Model):
    __tablename__ = "posts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    likes = db.relationship("Like", backref="post", lazy="dynamic", cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="post", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, current_user_id=None):
        return {
            "id": self.id,
            "content": self.content,
            "image_url": self.image_url,
            "created_at": self.created_at.isoformat(),
            "author": self.author.to_dict(),
            "likes_count": self.likes.count(),
            "comments_count": self.comments.count(),
            "liked_by_me": bool(
                current_user_id
                and self.likes.filter_by(user_id=current_user_id).first()
            ),
        }


class Like(db.Model):
    __tablename__ = "likes"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("post_id", "user_id", name="unique_like"),)


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "author": self.author.to_dict(),
        }


class Story(db.Model):
    __tablename__ = "stories"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    image_url = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(hours=24))

    def to_dict(self):
        return {
            "id": self.id,
            "image_url": self.image_url,
            "created_at": self.created_at.isoformat(),
            "author": self.author.to_dict(),
        }


class Reel(db.Model):
    __tablename__ = "reels"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    video_url = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User")
    likes = db.relationship("ReelLike", backref="reel", lazy="dynamic", cascade="all, delete-orphan")
    comments = db.relationship("ReelComment", backref="reel", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, current_user_id=None):
        return {
            "id": self.id,
            "video_url": self.video_url,
            "caption": self.caption,
            "created_at": self.created_at.isoformat(),
            "author": self.author.to_dict(),
            "likes_count": self.likes.count(),
            "comments_count": self.comments.count(),
            "liked_by_me": bool(
                current_user_id
                and self.likes.filter_by(user_id=current_user_id).first()
            ),
        }


class ReelLike(db.Model):
    __tablename__ = "reel_likes"

    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey("reels.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("reel_id", "user_id", name="unique_reel_like"),)


class ReelComment(db.Model):
    __tablename__ = "reel_comments"

    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey("reels.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "author": self.author.to_dict(),
        }


class Conversation(db.Model):
    """محادثة ثنائية بين مستخدمين (1-to-1)."""
    __tablename__ = "conversations"

    id = db.Column(db.Integer, primary_key=True)
    user1_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    user2_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user1 = db.relationship("User", foreign_keys=[user1_id])
    user2 = db.relationship("User", foreign_keys=[user2_id])
    messages = db.relationship(
        "Message", backref="conversation", lazy="dynamic",
        cascade="all, delete-orphan", order_by="Message.created_at"
    )

    def other_user(self, current_user_id):
        return self.user2 if self.user1_id == current_user_id else self.user1

    def to_dict(self, current_user_id):
        last_msg = self.messages.order_by(Message.created_at.desc()).first()
        unread_count = self.messages.filter_by(is_read=False).filter(
            Message.sender_id != current_user_id
        ).count()
        other = self.other_user(current_user_id)
        return {
            "id": self.id,
            "other_user": other.to_dict(),
            "last_message": last_msg.content if last_msg else None,
            "last_message_at": last_msg.created_at.isoformat() if last_msg else None,
            "unread_count": unread_count,
        }


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "content": self.content,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat(),
        }
