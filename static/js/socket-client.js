/**
 * socket-client.js
 * اتصال WebSocket مشترك بين صفحة الخلاصة وصفحة المحادثات.
 * يوفر واجهة بسيطة للاستماع للأحداث اللحظية (رسائل، حالة الاتصال، منشورات جديدة).
 */

const CURRENT_USER = JSON.parse(document.body.dataset.user || "null");

const socket = io({
  transports: ["websocket", "polling"],
});

socket.on("connect_error", (err) => {
  console.warn("bobo socket connection issue:", err.message);
});

/** يولّد لون + حرف أول كأفاتار نصي عند غياب صورة بروفايل حقيقية */
function renderAvatar(el, user, size) {
  if (!el || !user) return;
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.fontSize = Math.round(size * 0.4) + "px";

  if (user.avatar_url) {
    el.innerHTML = `<img src="${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    el.style.background = "transparent";
  } else {
    el.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
    el.style.background = user.avatar_color || "#F2B705";
  }
}

/** يبني عنصر أفاتار HTML كنص (لاستخدامه داخل innerHTML مباشرة) */
function avatarHTML(user, size, extraClass = "") {
  if (!user) return "";
  if (user.avatar_url) {
    return `<div class="avatar ${extraClass}" style="width:${size}px;height:${size}px;">
      <img src="${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
    </div>`;
  }
  const letter = (user.name || "?").trim().charAt(0).toUpperCase();
  const color = user.avatar_color || "#F2B705";
  return `<div class="avatar ${extraClass}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${color};">${letter}</div>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return new Date(isoString).toLocaleDateString("ar-EG");
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// تسجيل الخروج (مشترك بين الصفحتين)
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch("/auth/logout", { method: "POST" });
      window.location.href = "/login";
    });
  }

  if (CURRENT_USER) {
    document.querySelectorAll("#profileAvatar, #composerAvatar, #myStoryAvatar").forEach((el) => {
      if (el.id === "myStoryAvatar") return; // يحتفظ بأيقونة +
      renderAvatar(el, CURRENT_USER, el.offsetWidth || 40);
    });
  }
});
