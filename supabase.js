/* supabase.js - lưu tiến trình + lịch sử chơi của 火鍋の店 lên Supabase.
 * Nạp SAU script chính của game (xem hướng dẫn trong chat).
 * Cần: thư viện @supabase/supabase-js (UMD) nạp trước file này. */
(function () {
  "use strict";

  /* ====== ĐIỀN 2 DÒNG NÀY ====== */
  const SUPABASE_URL = "https://yhzylifppsyiekcxobtp.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_sXTtq5dB5Kua5NjFuRsjGQ_vetbo9l2";
  /* ============================ */

  const sb = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  let cloudUser = null;
  let cloudTimer = null;

  const hasProgress = () =>
    S.day > 1 ||
    S.money !== STARTING_MONEY ||
    Object.keys(S.inventory || {}).length > 0;

  /* ---- Nút "Tiếp tục" (tự tạo, đặt trên nút Cài đặt) ---- */
  const contBtn = document.createElement("button");
  contBtn.className = "btn btn-sub";
  contBtn.id = "continueBtn";
  contBtn.hidden = true;
  contBtn.innerHTML = '<span data-i="continue"></span>';
  contBtn.querySelector("span").textContent = T().continue;
  $("settingsBtn").parentNode.insertBefore(contBtn, $("settingsBtn"));
  contBtn.onclick = () => startGame(); // giữ nguyên tiến trình hiện tại

  function updateContinueBtn() {
    contBtn.hidden = !hasProgress();
  }

  /* Nút Bắt đầu: nếu đã có tiến trình thì hỏi trước khi xóa */
  const origPlay = $("playBtn").onclick;
  $("playBtn").onclick = () => {
    if (hasProgress() && !confirm(T().confirmText)) return;
    origPlay();
  };

  /* Mỗi lần màn hình bắt đầu hiện lại thì cập nhật nút Tiếp tục */
  new MutationObserver(() => {
    if (!$("startScreen").classList.contains("hide")) updateContinueBtn();
  }).observe($("startScreen"), { attributes: true, attributeFilter: ["class"] });

  /* ---- Lưu lên cloud (gộp nhiều lần lưu liên tiếp) ---- */
  window.cloudSave = function () {
    if (!sb || !cloudUser) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(async () => {
      const { error } = await sb.from("game_saves").upsert({
        user_id: cloudUser.id,
        current_day: S.day,
        money: S.money,
        inventory: S.inventory,
        intro_seen: S.introSeen,
        updated_at: new Date(S.updatedAt || Date.now()).toISOString(),
      });
      if (error) console.warn("cloud save failed", error);
    }, 500);
  };

  /* ---- Lịch sử chơi ---- */
  async function logHistory(day, won, correct) {
    if (!sb || !cloudUser) return;
    const { error } = await sb.from("play_history").insert({
      user_id: cloudUser.id,
      day,
      won,
      correct,
      money_after: S.money,
    });
    if (error) console.warn("history failed", error);
  }

  /* ---- Kết thúc ngày: ghi lịch sử (game đã tự sang ngày mới trong endDay) ---- */
  const origEndDay = endDay;
  endDay = function () {
    const day = S.day; // ngày vừa chơi (trước khi tăng)
    const won = dayRevenue - dayPenalty >= 0; // lãi ròng trong ngày
    const correct = good;
    origEndDay(); // hiện bảng doanh thu, tăng ngày và lưu
    logHistory(day, won, correct);
  };

  /* ---- Khởi tạo: đăng nhập ẩn danh + tải bản lưu ---- */
  async function cloudInit() {
    if (!sb) {
      updateContinueBtn();
      return;
    }
    try {
      let {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      cloudUser = session.user;

      const { data: row, error } = await sb
        .from("game_saves")
        .select("*")
        .eq("user_id", cloudUser.id)
        .maybeSingle();
      if (error) throw error;

      const idle = !$("startScreen").classList.contains("hide"); // chưa vào game
      if (row) {
        const cloud = {
          day: row.current_day,
          money: row.money,
          inventory: row.inventory || {},
          introSeen: row.intro_seen,
          updatedAt: Date.parse(row.updated_at),
        };
        if (idle && (!S.updatedAt || cloud.updatedAt >= S.updatedAt)) {
          S = cloud; // bản cloud mới hơn
          localStorage.setItem(KEY, JSON.stringify(S));
        } else {
          window.cloudSave(); // bản local mới hơn -> đẩy lên
        }
      } else if (hasProgress()) {
        window.cloudSave(); // lần đầu: đẩy bản local cũ lên
      }
    } catch (e) {
      console.warn("cloud init failed, dùng localStorage", e);
    }
    updateContinueBtn();
    paint();
  }

  updateContinueBtn();
  cloudInit();
})();