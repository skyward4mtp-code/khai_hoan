const $ = (id) => document.getElementById(id);

const PAGE_SIZE = 10;
const REACHED_STORAGE_KEY = 'skyward_khai_hoan_reached_milestones_v2';
let allTransactions = [];
let currentPage = 1;
let firstRenderDone = false;
let musicPlayerLoaded = false;
let musicYoutubeUrl = '';

const money = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0)) + ' đ';
const dt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', { hour12: false });
};

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getYouTubeVideoId(url) {
  const input = String(url || '').trim();
  if (!input) return '';
  const directId = input.match(/^[a-zA-Z0-9_-]{11}$/);
  if (directId) return input;
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || '';
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const embedMatch = u.pathname.match(/\/(embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[2];
  } catch {}
  const loose = input.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return loose ? loose[1] : '';
}

let youtubeApiRequested = false;
let youtubePlayer = null;
let musicMuted = false;
let musicReady = false;
const MUSIC_VOLUME = 12; // âm lượng nền nhỏ, sửa tại đây nếu muốn lớn hơn/nhỏ hơn

function syncSpeakerButtons() {
  const icon = musicMuted ? '🔇' : '🔈';
  const text = musicMuted ? '🔇 Bật nhạc' : '🔈 Tắt nhạc';
  const floating = $('floatingSpeakerBtn');
  const hero = $('musicToggleBtn');
  if (floating) floating.textContent = icon;
  if (hero) hero.textContent = text;
}

function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    createBackgroundMusicPlayer();
    return;
  }
  if (youtubeApiRequested) return;
  youtubeApiRequested = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
  createBackgroundMusicPlayer();
};

function createBackgroundMusicPlayer() {
  if (youtubePlayer || !window.YT || !window.YT.Player) return;
  const videoId = getYouTubeVideoId(musicYoutubeUrl);
  const holder = $('musicPlayer');
  if (!videoId || !holder) return;

  youtubePlayer = new YT.Player('musicPlayer', {
    width: '1',
    height: '1',
    videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      loop: 1,
      playlist: videoId,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onReady: (event) => {
        musicReady = true;
        try {
          event.target.setVolume(MUSIC_VOLUME);
          event.target.unMute();
          event.target.playVideo();
        } catch {}
        syncSpeakerButtons();
      },
      onStateChange: (event) => {
        // Nếu trình duyệt chặn autoplay âm thanh, người dùng chỉ cần bấm biểu tượng loa một lần.
        if (event.data === YT.PlayerState.PAUSED && !musicMuted) {
          syncSpeakerButtons();
        }
      },
    },
  });
}

function toggleBackgroundMusic() {
  if (!youtubePlayer) {
    ensureYouTubeApi();
    return;
  }
  try {
    if (!musicReady) return;
    if (musicMuted || youtubePlayer.isMuted()) {
      musicMuted = false;
      youtubePlayer.unMute();
      youtubePlayer.setVolume(MUSIC_VOLUME);
      youtubePlayer.playVideo();
    } else {
      musicMuted = true;
      youtubePlayer.mute();
    }
  } catch {}
  syncSpeakerButtons();
}

function startBackgroundMusic() {
  if (!musicYoutubeUrl) return;
  ensureYouTubeApi();
  syncSpeakerButtons();
}

function getStoredReachedMilestones() {
  try { return JSON.parse(localStorage.getItem(REACHED_STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function setStoredReachedMilestones(keys) {
  localStorage.setItem(REACHED_STORAGE_KEY, JSON.stringify([...new Set(keys)]));
}

function showMilestoneToast(milestone) {
  const toast = $('milestoneToast');
  if (!toast || !milestone) return;
  const items = (milestone.items || []).slice(0, 10).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  toast.innerHTML = `
    <button class="toast-close" aria-label="Đóng">×</button>
    <div class="toast-kicker">Yeah, chúng ta đã có...</div>
    <strong>${escapeHtml(milestone.title)} để chờ đón Tùng comeback</strong>
    <ul>${items}</ul>
  `;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  toast.querySelector('.toast-close').onclick = () => toast.classList.add('hidden');
  clearTimeout(showMilestoneToast.timer);
  showMilestoneToast.timer = setTimeout(() => toast.classList.add('hidden'), 9500);
}

function checkNewReachedMilestones(milestones = []) {
  const reachedKeys = milestones.filter(m => m.reached).map(m => String(m.amount));
  const stored = getStoredReachedMilestones();
  const newlyReached = milestones.filter(m => m.reached && !stored.includes(String(m.amount)));
  setStoredReachedMilestones([...stored, ...reachedKeys]);
  if (!firstRenderDone) return;
  if (newlyReached.length) showMilestoneToast(newlyReached[newlyReached.length - 1]);
}

function renderPercentScale(percent) {
  const scale = $('percentScale');
  scale.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const point = (i + 1) * 10;
    return `<span class="${percent >= point ? 'active' : ''}">${point}%</span>`;
  }).join('');
}

function renderTransactionsPage() {
  const totalPages = Math.max(1, Math.ceil(allTransactions.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = allTransactions.slice(start, start + PAGE_SIZE);

  $('recentRows').innerHTML = pageRows.map(r => `
    <tr>
      <td>${dt(r.time)}</td>
      <td>${escapeHtml(r.sender)}</td>
      <td class="amount">+${money(r.amount)}</td>
      <td class="message-cell">${escapeHtml(r.message || '')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">Chưa có giao dịch nào sau mốc bắt đầu.</td></tr>';

  $('pageInfo').textContent = `Trang ${currentPage}/${totalPages} · ${allTransactions.length} giao dịch`;
  $('prevPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= totalPages;
}

function renderMilestones(data) {
  const milestones = data.milestones || [];
  const target = Number(data.targetAmount || 0);
  const total = Number(data.totalAmount || 0);
  const rail = $('milestoneRail');
  const unlocked = $('unlockedBox');
  const nextText = $('nextMilestoneText');

  rail.innerHTML = milestones.map((m, index) => {
    const unlockPercent = target > 0 ? Math.min(100, (Number(m.amount || 0) / target) * 100) : 0;
    const currentToMilestone = Number(m.amount || 0) > 0 ? Math.min(100, (total / Number(m.amount || 0)) * 100) : 0;
    const isUnlocked = !!m.reached;
    return `
      <article class="milestone ${isUnlocked ? 'unlocked' : 'locked'}">
        <span class="lock-badge">🔒</span>
        <div class="milestone-icon">${isUnlocked ? (index === 0 ? '🔥' : '✓') : '🔒'}</div>
        <h3>${escapeHtml(m.title)}</h3>
        <div class="target">${escapeHtml(m.subtitle || money(m.amount))}</div>
        <div class="milestone-items">
          ${(m.items || []).map(item => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="milestone-state">
          ${isUnlocked ? '✓ ĐÃ MỞ KHÓA' : `Còn ${money(m.remaining || 0)}`}
        </div>
        <div class="card-percent">
          <span>${unlockPercent.toFixed(2).replace('.00', '')}%</span>
          <div class="card-percent-bar"><div class="card-percent-fill" style="width:${currentToMilestone}%"></div></div>
        </div>
      </article>
    `;
  }).join('');

  if (data.nextMilestone) {
    nextText.textContent = `Mốc tiếp theo: ${data.nextMilestone.title} · còn ${money(data.nextMilestone.remaining || 0)}`;
  } else {
    nextText.textContent = 'Đã hoàn thành target Khải Hoàn';
  }

  const items = data.unlockedItems || [];
  unlocked.innerHTML = items.length ? `
    <p class="section-kicker">YEAH, CHÚNG TA ĐÃ CÓ...</p>
    <h2>Đã mở khóa</h2>
    <div class="unlock-list">${items.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    <div class="comeback">Để chờ đón <strong>TÙNG COMEBACK</strong></div>
  ` : `
    <p class="section-kicker">HÀNH TRÌNH ĐANG BẮT ĐẦU</p>
    <h2>Chưa mở khóa mốc</h2>
    <p class="muted">Donate sẽ được cộng dồn để mở khóa từng hạng mục support.</p>
  `;

  checkNewReachedMilestones(milestones);
}


function renderInternalFund(data) {
  const box = $('internalFundBox');
  if (!box) return;

  const milestones = data.internalFundMilestones || [];

  box.innerHTML = `
    <p class="section-kicker">FLAG DONATE</p>

    <h2 class="internal-heading-small">Skyward tặng Sky LED cộng hưởng</h2>

    <p class="internal-note">
      Project nội bộ: khi donate tăng thêm đạt mốc, Skyward sẽ tặng Sky thêm flag LED cộng hưởng.
    </p>

    <div class="internal-list flag-list flag-list-vertical">
      ${milestones.map((m) => {
        const reached = !!m.reached;

        const milestoneLabel = Number(m.amount || 0) >= 1000000
          ? `${Math.round(Number(m.amount || 0) / 1000000)}TR`
          : money(Number(m.amount || 0)).replace(' đ', '');

        const rawTitle = m.shortTitle || m.title || '';
        const cleanTitle = rawTitle.replace(/^LED\s*/i, '').trim();

        return `
          <article class="internal-item flag-item flag-item-vertical ${reached ? 'reached' : 'locked'}">
            <div class="internal-icon flag-icon-center">
              ${reached ? '✓' : '🔒'}
            </div>

            <div class="internal-content flag-content-center">
              <div class="internal-label">Góp ${milestoneLabel}</div>
              <div class="internal-title flag-title-small">LED ${escapeHtml(cleanTitle)}</div>
              <div class="flag-status">${reached ? 'Đã mở flag' : 'Chưa mở flag'}</div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function render(data) {
  $('totalAmount').textContent = money(data.totalAmount);
  $('targetAmount').textContent = money(data.targetAmount);
  const baseNote = $('baseFundNote');
  if (baseNote) {
    const base = Number(data.initialFundAmount || 0);
    const donate = Number(data.donationAmount || 0);
    baseNote.innerHTML = base > 0
      ? `Đã trích quỹ nền <strong>${money(base)}</strong>. Tiến độ bắt đầu từ mốc <strong>70M</strong> + donate đã ghi nhận <strong>${money(donate)}</strong>.`
      : '';
  }
  $('transactionCount').textContent = data.transactionCount || 0;

  const percent = Number(data.progressPercent || 0);
  const safePercent = Math.min(100, Math.max(0, percent));
  $('progressBar').style.width = `${safePercent}%`;
  $('progressBadge').style.left = `${safePercent}%`;
  $('progressBadge').textContent = `${percent.toFixed(2)}%`;
  $('progressText').innerHTML = `Đạt <strong>${percent.toFixed(2)}%</strong> target Khải Hoàn`;
  $('remainText').textContent = data.targetAmount > data.totalAmount
    ? `Còn ${money(data.targetAmount - data.totalAmount)}`
    : 'Đã đạt target 220M';
  renderPercentScale(percent);

  $('lastRefresh').textContent = data.lastRefreshAt ? `Quét lần cuối: ${dt(data.lastRefreshAt)}` : 'Chưa quét';

  const err = $('errorBox');
  if (data.lastError) {
    err.classList.remove('hidden');
    err.textContent = `Lỗi quét dữ liệu: ${data.lastError}`;
  } else {
    err.classList.add('hidden');
    err.textContent = '';
  }

  $('top10').innerHTML = (data.top10 || []).map((x, i) => `
    <div class="top-item">
      <div class="rank">${i + 1}</div>
      <div>
        <div class="name" title="${escapeHtml(x.sender)}">${escapeHtml(x.sender)}</div>
        <div class="top-msg" title="${escapeHtml(x.message || '')}">${escapeHtml(x.message || '')}</div>
      </div>
      <div class="money">${money(x.amount)}</div>
    </div>
  `).join('') || '<p class="hint">Chưa có dữ liệu.</p>';

  renderMilestones(data);
  renderInternalFund(data);
  const oldPage = currentPage;
  allTransactions = data.transactions || [];
  currentPage = oldPage;
  renderTransactionsPage();
  firstRenderDone = true;
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    ['giftFormLink', 'giftFormLink2', 'giftFormLink3'].forEach(id => {
      const link = $(id);
      if (link && settings.giftFormUrl) link.href = settings.giftFormUrl;
    });
    musicYoutubeUrl = settings.musicYoutubeUrl || '';
  } catch {}
}

async function loadStatus() {
  const res = await fetch('/api/status');
  render(await res.json());
}

async function refreshNow() {
  $('refreshBtn').disabled = true;
  $('refreshBtn').textContent = 'Đang quét...';
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    currentPage = 1;
    render(await res.json());
  } finally {
    $('refreshBtn').disabled = false;
    $('refreshBtn').textContent = 'Quét ngay';
  }
}

function openDonateModal() {
  const modal = $('donateModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeDonateModal() {
  const modal = $('donateModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

$('donateQrBtn')?.addEventListener('click', openDonateModal);
$('navDonateBtn')?.addEventListener('click', openDonateModal);
$('musicToggleBtn')?.addEventListener('click', toggleBackgroundMusic);
$('floatingSpeakerBtn')?.addEventListener('click', toggleBackgroundMusic);
document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeDonateModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDonateModal(); });

$('prevPage').addEventListener('click', () => { currentPage -= 1; renderTransactionsPage(); });
$('nextPage').addEventListener('click', () => { currentPage += 1; renderTransactionsPage(); });

(async function init() {
  await loadSettings();
  startBackgroundMusic();
  await loadStatus();
  setInterval(loadStatus, 10000);
})();
