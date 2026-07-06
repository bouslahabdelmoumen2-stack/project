/**
 * reels.js
 * منطق صفحة الريلز: عرض فيديوهات بالتمرير العمودي (مثل TikTok/Instagram Reels)،
 * تشغيل تلقائي للفيديو الظاهر فقط، إعجاب/تعليق لحظي، ورفع ريلز جديد.
 */

const reelsFeed = document.getElementById("reelsFeed");
const reelsLoading = document.getElementById("reelsLoading");
let currentReelPage = 1;
let isLoadingReels = false;
let selectedVideoFile = null;
let activeCommentsReelId = null;

// ---------------------------------------------------------------
// بناء عنصر ريلز واحد
// ---------------------------------------------------------------
function buildReelItem(reel) {
  const item = document.createElement("div");
  item.className = "reel-item";
  item.dataset.reelId = reel.id;

  item.innerHTML = `
    <video src="${reel.video_url}" loop muted playsinline preload="metadata"></video>
    <button class="reel-mute-btn" title="الصوت">🔇</button>

    <div class="reel-side-actions">
      <button class="reel-action-btn like-btn ${reel.liked_by_me ? "liked" : ""}">
        <svg viewBox="0 0 24 24" fill="${reel.liked_by_me ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
        </svg>
        <span class="like-count">${reel.likes_count}</span>
      </button>
      <button class="reel-action-btn comment-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-4.7 7.6 8.38 8.38 0 0 1-3.8.9H12a8.5 8.5 0 0 1-9-8.5 8.5 8.5 0 0 1 9-8.5h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="comment-count">${reel.comments_count}</span>
      </button>
      <button class="reel-action-btn share-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
        <span>مشاركة</span>
      </button>
    </div>

    <div class="reel-overlay-bottom">
      <div class="reel-author-row">
        ${avatarHTML(reel.author, 34)}
        <span class="reel-author-name">${escapeHTML(reel.author.name)}</span>
      </div>
      ${reel.caption ? `<div class="reel-caption">${escapeHTML(reel.caption)}</div>` : ""}
    </div>
  `;

  const video = item.querySelector("video");
  const muteBtn = item.querySelector(".reel-mute-btn");
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? "🔇" : "🔊";
  });
  item.addEventListener("click", (e) => {
    if (e.target.closest(".reel-side-actions") || e.target.closest(".reel-mute-btn")) return;
    if (video.paused) video.play(); else video.pause();
  });

  item.querySelector(".like-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleReelLike(reel.id, item);
  });
  item.querySelector(".comment-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openReelComments(reel.id);
  });
  item.querySelector(".share-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${window.location.origin}/reels#reel-${reel.id}`);
    showToast("تم نسخ رابط الريلز");
  });

  return item;
}

async function loadReels(page = 1) {
  if (isLoadingReels) return;
  isLoadingReels = true;
  try {
    const res = await fetch(`/api/reels?page=${page}`);
    const data = await res.json();
    reelsLoading.classList.add("hidden");
    data.reels.forEach((reel) => reelsFeed.appendChild(buildReelItem(reel)));
    if (data.reels.length === 0 && page === 1) {
      reelsLoading.classList.remove("hidden");
      reelsLoading.textContent = "لا توجد ريلز بعد. كن أول من ينشر! 🎬";
    }
    setupAutoplayObserver();
  } catch (err) {
    reelsLoading.textContent = "تعذر تحميل الريلز";
    reelsLoading.classList.remove("hidden");
  } finally {
    isLoadingReels = false;
  }
}

// ---------------------------------------------------------------
// تشغيل تلقائي للفيديو الظاهر فقط في الشاشة
// ---------------------------------------------------------------
let autoplayObserver = null;
function setupAutoplayObserver() {
  if (autoplayObserver) autoplayObserver.disconnect();
  autoplayObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
  );
  document.querySelectorAll(".reel-item").forEach((el) => autoplayObserver.observe(el));
}

// تحميل المزيد عند الاقتراب من النهاية
reelsFeed.addEventListener("scroll", () => {
  if (reelsFeed.scrollTop + reelsFeed.clientHeight >= reelsFeed.scrollHeight - window.innerHeight) {
    currentReelPage++;
    loadReels(currentReelPage);
  }
});

// ---------------------------------------------------------------
// الإعجاب
// ---------------------------------------------------------------
async function toggleReelLike(reelId, item) {
  const btn = item.querySelector(".like-btn");
  const countEl = item.querySelector(".like-count");
  btn.classList.toggle("liked");
  try {
    const res = await fetch(`/api/reels/${reelId}/like`, { method: "POST" });
    const data = await res.json();
    countEl.textContent = data.likes_count;
    btn.classList.toggle("liked", data.liked);
    btn.querySelector("svg").setAttribute("fill", data.liked ? "currentColor" : "none");
  } catch (err) {
    btn.classList.toggle("liked");
  }
}

// ---------------------------------------------------------------
// التعليقات (نافذة منبثقة)
// ---------------------------------------------------------------
const reelCommentsModal = document.getElementById("reelCommentsModal");
const reelCommentsList = document.getElementById("reelCommentsList");
const reelCommentInput = document.getElementById("reelCommentInput");

async function openReelComments(reelId) {
  activeCommentsReelId = reelId;
  reelCommentsModal.classList.add("open");
  reelCommentsList.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">جاري التحميل...</div>`;

  const res = await fetch(`/api/reels/${reelId}/comments`);
  const data = await res.json();
  reelCommentsList.innerHTML = "";
  if (data.comments.length === 0) {
    reelCommentsList.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; text-align:center; padding:20px 0;">لا توجد تعليقات بعد</div>`;
  }
  data.comments.forEach((c) => appendReelComment(c));
}

function appendReelComment(comment) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex; gap:8px; align-items:flex-start;";
  el.innerHTML = `
    ${avatarHTML(comment.author, 30)}
    <div style="background:var(--bg-elevated-2); border-radius:14px; padding:8px 12px; font-size:13px; flex:1;">
      <strong style="font-size:12.5px;">${escapeHTML(comment.author.name)}</strong><br>
      ${escapeHTML(comment.content)}
    </div>
  `;
  reelCommentsList.appendChild(el);
}

document.getElementById("closeCommentsModalBtn").addEventListener("click", () => {
  reelCommentsModal.classList.remove("open");
  activeCommentsReelId = null;
});
reelCommentsModal.addEventListener("click", (e) => {
  if (e.target === reelCommentsModal) {
    reelCommentsModal.classList.remove("open");
    activeCommentsReelId = null;
  }
});

async function submitReelComment() {
  const content = reelCommentInput.value.trim();
  if (!content || !activeCommentsReelId) return;
  reelCommentInput.value = "";
  const res = await fetch(`/api/reels/${activeCommentsReelId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (res.ok) appendReelComment(data.comment);
}
document.getElementById("sendReelCommentBtn").addEventListener("click", submitReelComment);
reelCommentInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitReelComment(); });

// ---------------------------------------------------------------
// نافذة رفع ريلز جديد
// ---------------------------------------------------------------
const reelModal = document.getElementById("reelModal");
const reelVideoInput = document.getElementById("reelVideoInput");
const videoPreviewWrap = document.getElementById("videoPreviewWrap");
const videoPreview = document.getElementById("videoPreview");
const reelCaption = document.getElementById("reelCaption");
const submitReelBtn = document.getElementById("submitReelBtn");

document.getElementById("uploadReelBtn").addEventListener("click", () => reelModal.classList.add("open"));
document.getElementById("closeReelModalBtn").addEventListener("click", closeReelModal);
reelModal.addEventListener("click", (e) => { if (e.target === reelModal) closeReelModal(); });

function closeReelModal() {
  reelModal.classList.remove("open");
  selectedVideoFile = null;
  reelVideoInput.value = "";
  reelCaption.value = "";
  videoPreviewWrap.classList.add("hidden");
}

reelVideoInput.addEventListener("change", () => {
  const file = reelVideoInput.files[0];
  if (!file) return;
  selectedVideoFile = file;
  videoPreview.src = URL.createObjectURL(file);
  videoPreviewWrap.classList.remove("hidden");
});

submitReelBtn.addEventListener("click", async () => {
  if (!selectedVideoFile) {
    showToast("اختر فيديو أولاً");
    return;
  }
  submitReelBtn.disabled = true;
  submitReelBtn.textContent = "جاري الرفع...";

  const formData = new FormData();
  formData.append("video", selectedVideoFile);
  formData.append("caption", reelCaption.value.trim());

  try {
    const res = await fetch("/api/reels", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeReelModal();
    showToast("تم نشر الريلز!");
  } catch (err) {
    showToast(err.message || "تعذر رفع الريلز");
  } finally {
    submitReelBtn.disabled = false;
    submitReelBtn.textContent = "نشر الريلز";
  }
});

// ---------------------------------------------------------------
// الأحداث اللحظية (WebSocket)
// ---------------------------------------------------------------
socket.on("reel_created", (reel) => {
  const existing = reelsFeed.querySelector(`[data-reel-id="${reel.id}"]`);
  if (existing) return;
  reelsFeed.appendChild(buildReelItem(reel));
  setupAutoplayObserver();
});

socket.on("reel_like_updated", ({ reel_id, likes_count }) => {
  const item = reelsFeed.querySelector(`[data-reel-id="${reel_id}"]`);
  if (item) item.querySelector(".like-count").textContent = likes_count;
});

socket.on("reel_comment_created", ({ reel_id, comment }) => {
  const item = reelsFeed.querySelector(`[data-reel-id="${reel_id}"]`);
  if (item) {
    item.querySelector(".comment-count").textContent =
      parseInt(item.querySelector(".comment-count").textContent) + 1;
  }
  if (activeCommentsReelId === reel_id) appendReelComment(comment);
});

// ---------------------------------------------------------------
// التهيئة
// ---------------------------------------------------------------
loadReels(1);
