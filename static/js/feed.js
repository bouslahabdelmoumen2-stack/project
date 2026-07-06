/**
 * feed.js
 * منطق صفحة الخلاصة: عرض القصص، عرض المنشورات، إنشاء منشور جديد،
 * الإعجاب/التعليق، والتحديث اللحظي عبر WebSocket.
 */

const feedContainer = document.getElementById("feedContainer");
const postsLoading = document.getElementById("postsLoading");
let currentPage = 1;
let isLoadingPosts = false;
let selectedImageFile = null;

// ---------------------------------------------------------------
// القصص (Stories)
// ---------------------------------------------------------------
async function loadStories() {
  try {
    const res = await fetch("/api/stories");
    const data = await res.json();
    const tray = document.getElementById("storiesTray");

    data.stories.forEach((story) => {
      const item = document.createElement("div");
      item.className = "story-item";
      item.innerHTML = `
        <div class="story-ring">
          ${avatarHTML(story.author, 58)}
        </div>
        <span>${escapeHTML(story.author.name)}</span>
      `;
      tray.appendChild(item);
    });
  } catch (err) {
    console.error("فشل تحميل القصص:", err);
  }
}

document.getElementById("addStoryBtn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    if (!input.files.length) return;
    const formData = new FormData();
    formData.append("image", input.files[0]);
    try {
      const res = await fetch("/api/stories", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("تم نشر قصتك!");
      location.reload();
    } catch (err) {
      showToast("تعذر نشر القصة");
    }
  };
  input.click();
});

// ---------------------------------------------------------------
// المنشورات (Posts)
// ---------------------------------------------------------------
function buildPostCard(post) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.dataset.postId = post.id;

  card.innerHTML = `
    <div class="post-header">
      ${avatarHTML(post.author, 42)}
      <div class="post-header-info">
        <div class="post-author-name">${escapeHTML(post.author.name)}</div>
        <div class="post-time">${timeAgo(post.created_at)}</div>
      </div>
    </div>
    ${post.content ? `<div class="post-content">${escapeHTML(post.content)}</div>` : ""}
    ${post.image_url ? `<img class="post-image" src="${post.image_url}" loading="lazy">` : ""}
    <div class="post-actions">
      <button class="action-btn like-btn ${post.liked_by_me ? "liked" : ""}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.liked_by_me ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
        </svg>
        <span class="like-count">${post.likes_count}</span>
      </button>
      <button class="action-btn comment-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-4.7 7.6 8.38 8.38 0 0 1-3.8.9H12a8.5 8.5 0 0 1-9-8.5 8.5 8.5 0 0 1 9-8.5h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="comment-count">${post.comments_count}</span>
      </button>
      <button class="action-btn share-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
        مشاركة
      </button>
    </div>
    <div class="comments-section hidden" style="padding:0 16px 14px; display:flex; flex-direction:column; gap:8px;"></div>
  `;

  card.querySelector(".like-btn").addEventListener("click", () => toggleLike(post.id, card));
  card.querySelector(".comment-btn").addEventListener("click", () => toggleComments(post.id, card));
  card.querySelector(".share-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(`${window.location.origin}/feed#post-${post.id}`);
    showToast("تم نسخ رابط المنشور");
  });

  return card;
}

async function loadPosts(page = 1) {
  if (isLoadingPosts) return;
  isLoadingPosts = true;
  try {
    const res = await fetch(`/api/posts?page=${page}`);
    const data = await res.json();
    postsLoading.classList.add("hidden");
    data.posts.forEach((post) => feedContainer.appendChild(buildPostCard(post)));
    if (data.posts.length === 0 && page === 1) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `<div class="blob-icon">🫧</div><div>لا توجد منشورات بعد. كن أول من ينشر!</div>`;
      feedContainer.appendChild(empty);
    }
  } catch (err) {
    postsLoading.textContent = "تعذر تحميل المنشورات";
  } finally {
    isLoadingPosts = false;
  }
}

async function toggleLike(postId, card) {
  const btn = card.querySelector(".like-btn");
  const countEl = card.querySelector(".like-count");
  btn.classList.toggle("liked");
  try {
    const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
    const data = await res.json();
    countEl.textContent = data.likes_count;
    btn.classList.toggle("liked", data.liked);
    btn.querySelector("svg").setAttribute("fill", data.liked ? "currentColor" : "none");
  } catch (err) {
    btn.classList.toggle("liked"); // تراجع عن التغيير عند الفشل
  }
}

async function toggleComments(postId, card) {
  const section = card.querySelector(".comments-section");
  const isHidden = section.classList.contains("hidden");
  section.classList.toggle("hidden");
  if (!isHidden || section.dataset.loaded) return;

  section.dataset.loaded = "1";
  section.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">جاري التحميل...</div>`;

  const res = await fetch(`/api/posts/${postId}/comments`);
  const data = await res.json();
  section.innerHTML = "";

  data.comments.forEach((c) => appendComment(section, c));

  const inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex; gap:8px; margin-top:6px;";
  inputRow.innerHTML = `
    <input type="text" placeholder="اكتب تعليقًا..." style="flex:1; background:var(--bg-elevated-2); border:1px solid var(--border-subtle); border-radius:999px; padding:9px 14px; color:var(--text-primary); font-size:13px; text-align:right;">
  `;
  const input = inputRow.querySelector("input");
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    const content = input.value.trim();
    input.value = "";
    const res2 = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const d2 = await res2.json();
    if (res2.ok) {
      appendComment(section, d2.comment, inputRow);
      card.querySelector(".comment-count").textContent =
        parseInt(card.querySelector(".comment-count").textContent) + 1;
    }
  });
  section.appendChild(inputRow);
}

function appendComment(section, comment, beforeEl = null) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex; gap:8px; align-items:flex-start;";
  el.innerHTML = `
    ${avatarHTML(comment.author, 28)}
    <div style="background:var(--bg-elevated-2); border-radius:14px; padding:7px 12px; font-size:13px; flex:1;">
      <strong style="font-size:12.5px;">${escapeHTML(comment.author.name)}</strong><br>
      ${escapeHTML(comment.content)}
    </div>
  `;
  if (beforeEl) section.insertBefore(el, beforeEl);
  else section.appendChild(el);
}

// ---------------------------------------------------------------
// نافذة إنشاء منشور (Composer Modal)
// ---------------------------------------------------------------
const composerModal = document.getElementById("composerModal");
const postContent = document.getElementById("postContent");
const submitPostBtn = document.getElementById("submitPostBtn");
const postImageInput = document.getElementById("postImageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");

function openComposer() {
  composerModal.classList.add("open");
  setTimeout(() => postContent.focus(), 200);
}
function closeComposer() {
  composerModal.classList.remove("open");
  postContent.value = "";
  selectedImageFile = null;
  imagePreviewWrap.classList.add("hidden");
  postImageInput.value = "";
}

document.getElementById("openComposerBtn").addEventListener("click", openComposer);
document.getElementById("composerShortcut").addEventListener("click", openComposer);
document.getElementById("closeComposerBtn").addEventListener("click", closeComposer);
composerModal.addEventListener("click", (e) => { if (e.target === composerModal) closeComposer(); });

postImageInput.addEventListener("change", () => {
  const file = postImageInput.files[0];
  if (!file) return;
  selectedImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreviewWrap.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

document.getElementById("removeImageBtn").addEventListener("click", () => {
  selectedImageFile = null;
  postImageInput.value = "";
  imagePreviewWrap.classList.add("hidden");
});

submitPostBtn.addEventListener("click", async () => {
  const content = postContent.value.trim();
  if (!content && !selectedImageFile) {
    showToast("اكتب شيئًا أو أضف صورة أولاً");
    return;
  }
  submitPostBtn.disabled = true;
  submitPostBtn.textContent = "جاري النشر...";

  const formData = new FormData();
  formData.append("content", content);
  if (selectedImageFile) formData.append("image", selectedImageFile);

  try {
    const res = await fetch("/api/posts", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeComposer();
    showToast("تم نشر منشورك!");
    // لا حاجة لإضافته يدويًا هنا؛ سيصل عبر حدث post_created من WebSocket
  } catch (err) {
    showToast(err.message || "تعذر نشر المنشور");
  } finally {
    submitPostBtn.disabled = false;
    submitPostBtn.textContent = "نشر";
  }
});

// ---------------------------------------------------------------
// الأحداث اللحظية (WebSocket)
// ---------------------------------------------------------------
socket.on("post_created", (post) => {
  // يتجنب تكرار منشورنا نحن أنفسنا لو كان uid يطابق مستخدمنا (لأننا استلمناه فعليًا من REST)
  const existing = feedContainer.querySelector(`[data-post-id="${post.id}"]`);
  if (existing) return;
  const card = buildPostCard(post);
  const firstPost = feedContainer.querySelector(".post-card");
  if (firstPost) feedContainer.insertBefore(card, firstPost);
  else feedContainer.appendChild(card);
});

socket.on("like_updated", ({ post_id, likes_count }) => {
  const card = feedContainer.querySelector(`[data-post-id="${post_id}"]`);
  if (card) card.querySelector(".like-count").textContent = likes_count;
});

socket.on("comment_created", ({ post_id, comment }) => {
  const card = feedContainer.querySelector(`[data-post-id="${post_id}"]`);
  if (!card) return;
  card.querySelector(".comment-count").textContent =
    parseInt(card.querySelector(".comment-count").textContent) + 1;
});

// تحميل تلقائي عند التمرير للأسفل (Infinite scroll بسيط)
window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
    currentPage++;
    loadPosts(currentPage);
  }
});

// ---------------------------------------------------------------
// التهيئة
// ---------------------------------------------------------------
loadStories();
loadPosts(1);
