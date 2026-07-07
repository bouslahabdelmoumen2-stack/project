"""
منطق الاتصال اللحظي (WebSockets) عبر Flask-SocketIO.
مسؤول عن:
  - حالة الاتصال (Online / Offline) لحظيًا
  - إرسال واستقبال الرسائل الفورية
  - مؤشر "يكتب الآن..."
  - بث المنشورات الجديدة لحظيًا لكل المستخدمين المتصلين
"""
from datetime import datetime

from flask import request, session
from flask_socketio import SocketIO, emit, join_room, leave_room

from models import db, User, Conversation, Message

socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")

# يربط sid الخاص بـ socket.io بمعرف المستخدم، حتى نقدر نعرف مين قاطع الاتصال
connected_users = {}  # { sid: user_id }


def _user_room(user_id):
    return f"user_{user_id}"


@socketio.on("connect")
def handle_connect():
    user_id = session.get("user_id")
    if not user_id:
        return False  # يرفض الاتصال لو ما كان مسجل دخول

    connected_users[request.sid] = user_id
    join_room(_user_room(user_id))

    user = User.query.get(user_id)
    if user:
        user.is_online = True
        user.last_seen = datetime.utcnow()
        db.session.commit()

    # يبلغ الجميع أن هذا المستخدم أصبح متصلاً
    emit("presence_update", {"user_id": user_id, "is_online": True}, broadcast=True)


@socketio.on("disconnect")
def handle_disconnect():
    user_id = connected_users.pop(request.sid, None)
    if not user_id:
        return

    # تحقق ما إذا كان للمستخدم اتصال آخر مفتوح (تبويب ثاني) قبل تعليمه Offline
    still_connected = user_id in connected_users.values()
    if not still_connected:
        user = User.query.get(user_id)
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.session.commit()
        emit("presence_update", {"user_id": user_id, "is_online": False}, broadcast=True)


@socketio.on("send_message")
def handle_send_message(data):
    """
    data: { conversation_id, content }
    """
    user_id = session.get("user_id")
    if not user_id:
        return

    conversation_id = data.get("conversation_id")
    content = (data.get("content") or "").strip()
    if not conversation_id or not content:
        return

    conversation = Conversation.query.get(conversation_id)
    if not conversation or user_id not in (conversation.user1_id, conversation.user2_id):
        return  # المستخدم غير مصرح له بهذه المحادثة

    message = Message(conversation_id=conversation_id, sender_id=user_id, content=content)
    db.session.add(message)
    db.session.commit()

    payload = message.to_dict()
    other_id = conversation.other_user(user_id).id

    # يرسل للطرفين فورًا (المرسل والمستقبل) عبر غرفهم الخاصة
    emit("new_message", payload, room=_user_room(user_id))
    emit("new_message", payload, room=_user_room(other_id))


@socketio.on("typing")
def handle_typing(data):
    """يبلغ الطرف الآخر أن المستخدم الحالي يكتب الآن."""
    user_id = session.get("user_id")
    conversation_id = data.get("conversation_id")
    if not user_id or not conversation_id:
        return
    conversation = Conversation.query.get(conversation_id)
    if not conversation:
        return
    other_id = conversation.other_user(user_id).id
    emit("typing", {"conversation_id": conversation_id, "user_id": user_id},
         room=_user_room(other_id))


@socketio.on("mark_read")
def handle_mark_read(data):
    """يعلّم رسائل محادثة معينة كمقروءة، ويبلغ الطرف الآخر."""
    user_id = session.get("user_id")
    conversation_id = data.get("conversation_id")
    if not user_id or not conversation_id:
        return

    Message.query.filter(
        Message.conversation_id == conversation_id,
        Message.sender_id != user_id,
        Message.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.session.commit()


def broadcast_new_post(post_dict):
    """يُستدعى من مسار REST عند إنشاء منشور جديد، لبثه فورًا لكل المتصلين."""
    socketio.emit("post_created", post_dict, broadcast=True)


def broadcast_new_comment(post_id, comment_dict):
    socketio.emit("comment_created", {"post_id": post_id, "comment": comment_dict}, broadcast=True)


def broadcast_like_update(post_id, likes_count):
    socketio.emit("like_updated", {"post_id": post_id, "likes_count": likes_count}, broadcast=True)


def broadcast_new_reel(reel_dict):
    socketio.emit("reel_created", reel_dict, broadcast=True)


def broadcast_reel_like_update(reel_id, likes_count):
    socketio.emit("reel_like_updated", {"reel_id": reel_id, "likes_count": likes_count}, broadcast=True)


def broadcast_new_reel_comment(reel_id, comment_dict):
    socketio.emit("reel_comment_created", {"reel_id": reel_id, "comment": comment_dict}, broadcast=True)
