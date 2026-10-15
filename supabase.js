/* supabase.js - lưu tiến trình + lịch sử chơi của 火鍋の店 lên Supabase.
 * Nạp SAU script chính của game.
 * Cần: thư viện @supabase/supabase-js (UMD) nạp trước file này. */
(function () {
  "use strict";

  /* ====== ĐIỀN 2 DÒNG NÀY ====== */
  const SUPABASE_URL = "https://yhzylifppsyiekcxobtp.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_sXTtq5dB5Kua5NjFuRsjGQ_vetbo9l2";
  /* ============================ */

  /* Đặt true SAU KHI đã thêm 2 cột history + prices vào bảng game_saves (SQL trong chat).
     Khi true: báo cáo doanh thu theo ngày và giá bán tự chỉnh cũng được lưu lên cloud. */
  const CLOUD_EXTRA = false;

  const sb = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  let cloudUser = null;
  let cloudTimer = null;

  /* hasProgress() và refreshPlayLabel() do script chính của game định nghĩa:
     chỉ có MỘT nút ở trang đầu, ghi "Bắt đầu" (chưa chơi) hoặc "Tiếp tục" (đã chơi).
     Bấm nút khi đã có tiến trình sẽ chơi tiếp, KHÔNG xóa dữ liệu.
     Chơi lại từ đầu: Cài đặt -> "Bắt đầu lại từ đầu". */
  const updatePlayLabel = () => {
    if (window.refreshPlayLabel) window.refreshPlayLabel();
  };

  /* Mỗi lần màn hình bắt đầu hiện lại thì cập nhật nhãn nút */
  new MutationObserver(() => {
    if (!$("startScreen").classList.contains("hide")) updatePlayLabel();
  }).observe($("startScreen"), { attributes: true, attributeFilter: ["class"] });

  /* ---- Lưu lên cloud (gộp nhiều lần lưu liên tiếp) ---- */
  window.cloudSave = function () {
    if (!sb || !cloudUser) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(async () => {
      const payload = {
        user_id: cloudUser.id,
        current_day: S.day,
        money: S.money,
        inventory: S.inventory,
        intro_seen: S.introSeen,
        updated_at: new Date(S.updatedAt || Date.now()).toISOString(),
      };
      if (CLOUD_EXTRA) {
        payload.history = S.history || [];
        payload.prices = S.prices || {};
      }
      const { error } = await sb.from("game_saves").upsert(payload);
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
      updatePlayLabel();
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
        const cloud = Object.assign(newSave(), {
          day: row.current_day,
          money: row.money,
          inventory: row.inventory || {},
          introSeen: row.intro_seen,
          // tài khoản đã có bản lưu trên cloud = đã qua lần truy cập đầu -> không hiện lại Luật chơi
          rulesSeen: true,
          updatedAt: Date.parse(row.updated_at),
        });
        /* Cloud chưa lưu history/prices (trừ khi bật CLOUD_EXTRA) -> giữ bản local
           để không mất báo cáo doanh thu và giá bán đã chỉnh. */
        if (CLOUD_EXTRA) {
          cloud.history = Array.isArray(row.history) ? row.history : [];
          cloud.prices = row.prices && typeof row.prices === "object" ? row.prices : {};
        } else {
          cloud.history = S.history || [];
          cloud.prices = S.prices || {};
        }
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
    updatePlayLabel();
    paint();
  }

  updatePlayLabel();
  cloudInit();
})();