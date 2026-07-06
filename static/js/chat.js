/**
 * chat.js
 * منطق صفحة المسنجر: قائمة المحادثات، الأصدقاء المتصلون، البحث عن مستخدمين،
 * وشاشة المحادثة الفردية مع الإرسال/الاستقبال اللحظي عبر WebSocket.
 */

const listView = document.getElementById("listView");
const threadView = document.getElementById("threadView");
const bottomNav = document.getElementById("bottomNav");
const chatList = document.getElementById("chatList");
const activeFriends = document.getElementById("activeFriends");
const searchInput = document.getElementById("userSearchInput");
const searchResultsList = document.getElementById("searchResultsList");

let conversationsCache = [];
let currentConversationId = null;
let currentOtherUser = null;
let typingTimeout = null;

// ---------------------------------------------------------------
// قائمة المحادثات
// ---------------------------------------------------------------
function renderConversations(conversations) {
  conversationsCache = conversations;
  chatList.innerHTML = "";

  if (conversations.length === 0) {
    chatList.innerHTML = `
      <div class="empty-state">
        <div class="blob-icon">💬</div>
        <div>لا توجد محادثات بعد. ابحث عن صديق لبدء الدردشة!</div>
      </div>`;
    return;
  }

  conversations.forEach((conv) => {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.dataset.convId = conv.id;
    row.innerHTML = `
      ${avatarHTML(conv.other_user, 52)}
      <div class="chat-row-body">
        <div class="chat-row-top">
          <span class="chat-row-name">${escapeHTML(conv.other_user.name)}</span>
          <span class="chat-row-time">${conv.last_message_at ? timeAgo(conv.last_message_at) : ""}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="chat-row-snippet">${escapeHTML(conv.last_message || "ابدأ المحادثة الآن")}</span>
          ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ""}
        </div>
      </div>
    `;
    row.addEventListener("click", () => openThread(conv.id, conv.other_user));
    chatList.appendChild(row);
  });
}

async function loadConversations() {
  try {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    renderConversations(data.conversations);
  } catch (err) {
    chatList.innerHTML = `<div class="empty-state">تعذر تحميل المحادثات</div>`;
  }
}

// ---------------------------------------------------------------
// الأصدقاء المتصلون الآن (Active Friends)
// ---------------------------------------------------------------
async function loadOnlineFriends() {
  try {
    const res = await fetch("/api/users/online");
    const data = await res.json();
    activeFriends.innerHTML = "";
    if (data.users.length === 0) {
      activeFriends.innerHTML = `<span style="color:var(--text-muted); font-size:12.5px; padding:8px 0;">لا يوجد أصدقاء متصلون الآن</span>`;
      return;
    }
    data.users.forEach((u) => {
      const item = document.createElement("div");
      item.className = "friend-item";
      item.innerHTML = `
        <div class="friend-avatar-wrap">
          ${avatarHTML(u, 54)}
          <span class="online-indicator"></span>
        </div>
        <span>${escapeHTML(u.name)}</span>
      `;
      item.addEventListener("click", () => startConversationWith(u.id, u));
      activeFriends.appendChild(item);
    });
  } catch (err) {
    console.error("فشل تحميل الأصدقاء المتصلين:", err);
  }
}

// ---------------------------------------------------------------
// البحث عن مستخدمين لبدء محادثة جديدة
// ---------------------------------------------------------------
let searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) {
    searchResultsList.classList.add("hidden");
    chatList.classList.remove("hidden");
    return;
  }
  searchDebounce = setTimeout(async () => {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    searchResultsList.innerHTML = "";
    chatList.classList.add("hidden");
    searchResultsList.classList.remove("hidden");

    if (data.users.length === 0) {
      searchResultsList.innerHTML = `<div class="empty-state">لا يوجد مستخدمون بهذا الاسم</div>`;
      return;
    }
    data.users.forEach((u) => {
      const row = document.createElement("div");
      row.className = "chat-row";
      row.innerHTML = `
        ${avatarHTML(u, 52)}
        <div class="chat-row-body">
          <span class="chat-row-name">${escapeHTML(u.name)}</span>
          <div class="chat-row-snippet">${u.is_online ? "متصل الآن" : "غير متصل"}</div>
        </div>
      `;
      row.addEventListener("click", () => startConversationWith(u.id, u));
      searchResultsList.appendChild(row);
    });
  }, 300);
});

async function startConversationWith(userId, userObj) {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || "تعذر بدء المحادثة");
    return;
  }
  searchInput.value = "";
  searchResultsList.classList.add("hidden");
  chatList.classList.remove("hidden");
  openThread(data.conversation.id, userObj);
  loadConversations();
}

// ---------------------------------------------------------------
// شاشة المحادثة الفردية (Thread)
// ---------------------------------------------------------------
const threadMessages = document.getElementById("threadMessages");
const threadAvatar = document.getElementById("threadAvatar");
const threadName = document.getElementById("threadName");
const threadStatus = document.getElementById("threadStatus");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

async function openThread(convId, otherUser) {
  currentConversationId = convId;
  currentOtherUser = otherUser;

  listView.classList.add("hidden");
  bottomNav.classList.add("hidden");
  threadView.classList.remove("hidden");

  renderAvatar(threadAvatar, otherUser, 40);
  threadName.textContent = otherUser.name;
  threadStatus.textContent = otherUser.is_online ? "متصل الآن" : "غير متصل";

  threadMessages.innerHTML = `<div style="color:var(--text-muted); text-align:center; font-size:12px;">جاري تحميل الرسائل...</div>`;

  const res = await fetch(`/api/conversations/${convId}/messages`);
  const data = await res.json();
  threadMessages.innerHTML = "";
  data.messages.forEach((m) => appendMessage(m));
  scrollThreadToBottom();

  socket.emit("mark_read", { conversation_id: convId });
}

function appendMessage(msg) {
  const isMine = msg.sender_id === CURRENT_USER.id;
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${isMine ? "mine" : "theirs"}`;
  bubble.innerHTML = `${escapeHTML(msg.content)}<span class="msg-time">${new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>`;
  threadMessages.appendChild(bubble);
}

function scrollThreadToBottom() {
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

document.getElementById("backToListBtn").addEventListener("click", () => {
  threadView.classList.add("hidden");
  listView.classList.remove("hidden");
  bottomNav.classList.remove("hidden");
  currentConversationId = null;
  loadConversations();
});

function sendCurrentMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentConversationId) return;
  socket.emit("send_message", { conversation_id: currentConversationId, content });
  messageInput.value = "";
}

sendMessageBtn.addEventListener("click", sendCurrentMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCurrentMessage();
  else {
    socket.emit("typing", { conversation_id: currentConversationId });
  }
});

// ---------------------------------------------------------------
// الأحداث اللحظية (WebSocket)
// ---------------------------------------------------------------
socket.on("new_message", (msg) => {
  if (msg.conversation_id === currentConversationId) {
    appendMessage(msg);
    scrollThreadToBottom();
    if (msg.sender_id !== CURRENT_USER.id) {
      socket.emit("mark_read", { conversation_id: currentConversationId });
    }
  } else if (msg.sender_id !== CURRENT_USER.id) {
    showToast("رسالة جديدة");
  }
  loadConversations();
});

socket.on("typing", (data) => {
  if (data.conversation_id !== currentConversationId) return;
  let indicator = document.getElementById("typingIndicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "typingIndicator";
    indicator.className = "typing-indicator";
    indicator.innerHTML = "<span></span><span></span><span></span>";
    threadMessages.appendChild(indicator);
    scrollThreadToBottom();
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => indicator.remove(), 2000);
});

socket.on("presence_update", ({ user_id, is_online }) => {
  loadOnlineFriends();
  if (currentOtherUser && currentOtherUser.id === user_id) {
    threadStatus.textContent = is_online ? "متصل الآن" : "غير متصل";
  }
  loadConversations();
});

// ---------------------------------------------------------------
// التهيئة
// ---------------------------------------------------------------
loadConversations();
loadOnlineFriends();
