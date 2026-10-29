(() => {
  'use strict';

  const STORAGE_KEY = 'gradtrip.planner.v2';
  const MAX_DAYS = 10;
  const MAX_MEMBERS = 12;

  const $ = (selector) => document.querySelector(selector);
  const tripNameInput = $('#tripName');
  const destinationInput = $('#destination');
  const startDateInput = $('#startDate');
  const endDateInput = $('#endDate');
  const dateSummary = $('#dateSummary');
  const tripError = $('#tripError');
  const memberForm = $('#memberForm');
  const memberNameInput = $('#memberName');
  const memberSubmit = $('#memberSubmit');
  const memberCancel = $('#memberCancel');
  const memberError = $('#memberError');
  const memberList = $('#memberList');
  const readinessList = $('#readinessList');
  const wishWarning = $('#wishWarning');
  const ideaForm = $('#ideaForm');
  const ideaTitleInput = $('#ideaTitle');
  const ideaBySelect = $('#ideaBy');
  const ideaSourceInput = $('#ideaSource');
  const ideaNoteInput = $('#ideaNote');
  const ideaWishInput = $('#ideaWish');
  const ideaSubmit = $('#ideaSubmit');
  const cancelEditButton = $('#cancelEdit');
  const ideaError = $('#ideaError');
  const poolList = $('#poolList');
  const poolCount = $('#poolCount');
  const daysTrack = $('#daysTrack');
  const planSheet = $('#planSheet');
  const copyPlanButton = $('#copyPlan');
  const printPlanButton = $('#printPlan');
  const toastRegion = $('#toastRegion');
  const confirmModal = $('#confirmModal');
  const confirmTitle = $('#confirmTitle');
  const confirmBody = $('#confirmBody');
  const confirmOk = $('[data-confirm="ok"]');
  const confirmCancel = $('[data-confirm="cancel"]');

  let state = loadState();
  let editingIdeaId = null;
  let editingMemberId = null;
  let confirmResolver = null;

  function createEmptyState() {
    return {
      version: 2,
      trip: { name: '', destination: '', start: '', end: '' },
      members: [],
      inspirations: [],
      updatedAt: new Date().toISOString()
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
    } catch (error) {
      console.warn('GradTrip 本地数据读取失败，已使用空状态。', error);
      return createEmptyState();
    }
  }

  function normalizeState(raw) {
    const clean = createEmptyState();
    if (!raw || typeof raw !== 'object') return clean;

    const trip = raw.trip && typeof raw.trip === 'object' ? raw.trip : {};
    clean.trip = {
      name: safeText(trip.name, 30),
      destination: safeText(trip.destination, 20),
      start: safeText(trip.start, 10),
      end: safeText(trip.end, 10)
    };

    const memberIds = new Set();
    clean.members = Array.isArray(raw.members)
      ? raw.members
          .map((member) => ({
            id: safeText(member && member.id, 80) || uid(),
            name: safeText(member && member.name, 12)
          }))
          .filter((member) => {
            if (!member.name || memberIds.has(member.id)) return false;
            memberIds.add(member.id);
            return true;
          })
      : [];

    const ideaIds = new Set();
    clean.inspirations = Array.isArray(raw.inspirations)
      ? raw.inspirations
          .map((idea, index) => {
            const byId = safeText(idea && idea.byId, 80);
            return {
              id: safeText(idea && idea.id, 80) || uid(),
              title: safeText(idea && idea.title, 40),
              byId: memberIds.has(byId) ? byId : '',
              source: safeText(idea && idea.source, 160),
              note: safeText(idea && idea.note, 120),
              wish: Boolean(idea && idea.wish),
              day: Number.isInteger(idea && idea.day) && idea.day > 0 ? idea.day : null,
              order: Number.isInteger(idea && idea.order) && idea.order > 0 ? idea.order : index + 1,
              createdAt: safeText(idea && idea.createdAt, 40) || new Date().toISOString()
            };
          })
          .filter((idea) => {
            if (!idea.title || ideaIds.has(idea.id)) return false;
            ideaIds.add(idea.id);
            return true;
          })
      : [];

    clean.updatedAt = safeText(raw.updatedAt, 40) || new Date().toISOString();
    return clean;
  }

  function safeText(value, maxLength) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function persist() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast('浏览器存储空间不可用，当前修改可能不会保存。', 'error');
    }
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function sourceLabel(source) {
    if (!source) return '';
    if (isHttpUrl(source)) {
      try {
        return new URL(source).hostname.replace(/^www\./, '');
      } catch (error) {
        return source;
      }
    }
    return source;
  }

  function sourceHTML(source) {
    if (!source) return '';
    if (isHttpUrl(source)) {
      const label = sourceLabel(source);
      return `<a class="idea-source-link" href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">来源 · ${escapeHTML(label)}</a>`;
    }
    return `<span class="tag source">来源 · ${escapeHTML(source)}</span>`;
  }

  function memberById(id) {
    return state.members.find((member) => member.id === id) || null;
  }

  function memberName(id) {
    const member = memberById(id);
    return member ? member.name : '未指定';
  }

  function wishForMember(memberId) {
    return state.inspirations.find((idea) => idea.wish && idea.byId === memberId) || null;
  }

  function scheduledIdeas() {
    return state.inspirations
      .filter((idea) => idea.day !== null)
      .sort((a, b) => a.day - b.day || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }

  function poolIdeas() {
    return state.inspirations
      .filter((idea) => idea.day === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function unscheduledWishes() {
    return state.inspirations.filter((idea) => idea.wish && idea.day === null);
  }

  function parseLocalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function getDateInfo() {
    const { start, end } = state.trip;
    if (!start && !end) {
      return { status: 'empty', count: 0, dates: [], message: '填写日期后会自动生成按天行程。' };
    }
    if (!start || !end) {
      return { status: 'invalid', count: 0, dates: [], message: '开始日期和结束日期都需要选择。' };
    }
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (!startDate || !endDate) {
      return { status: 'invalid', count: 0, dates: [], message: '日期格式不正确，请重新选择。' };
    }
    const diff = Math.round((endDate - startDate) / 86400000) + 1;
    if (diff < 1) {
      return { status: 'invalid', count: 0, dates: [], message: '结束日期不能早于开始日期。' };
    }
    if (diff > MAX_DAYS) {
      return { status: 'invalid', count: 0, dates: [], message: `当前版本适合 1–${MAX_DAYS} 天的单目的地短途旅行。` };
    }
    return {
      status: 'valid',
      count: diff,
      dates: Array.from({ length: diff }, (_, index) => addDays(startDate, index)),
      message: `${diff} 天行程 · ${formatDate(startDate)} 至 ${formatDate(endDate)}`
    };
  }

  function formatDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function weekdayName(date) {
    return `周${'日一二三四五六'[date.getDay()]}`;
  }

  function setFieldError(element, message) {
    element.textContent = message || '';
    element.hidden = !message;
  }

  function render() {
    renderTrip();
    renderMembers();
    renderIdeaForm();
    renderPool();
    renderDays();
    renderReadiness();
    renderPlanSheet();
  }

  function renderTrip() {
    if (tripNameInput.value !== state.trip.name) tripNameInput.value = state.trip.name;
    if (destinationInput.value !== state.trip.destination) destinationInput.value = state.trip.destination;
    if (startDateInput.value !== state.trip.start) startDateInput.value = state.trip.start;
    if (endDateInput.value !== state.trip.end) endDateInput.value = state.trip.end;

    const info = getDateInfo();
    dateSummary.textContent = info.message;
    setFieldError(tripError, info.status === 'invalid' ? info.message : '');
  }

  function renderMembers() {
    memberSubmit.textContent = editingMemberId ? '保存昵称' : '添加';
    memberCancel.hidden = !editingMemberId;
    setFieldError(memberError, '');

    if (!state.members.length) {
      memberList.innerHTML = '<div class="member-empty">先添加同行伙伴，之后就能把灵感和心愿归属于具体的人。</div>';
      renderMemberOptions();
      return;
    }

    memberList.innerHTML = state.members.map((member) => {
      const wish = wishForMember(member.id);
      return `
        <article class="member-item" data-id="${escapeHTML(member.id)}">
          <div class="member-main">
            <span class="avatar" aria-hidden="true">${escapeHTML(member.name.slice(0, 1))}</span>
            <div>
              <p class="member-name">${escapeHTML(member.name)}</p>
              <p class="member-wish">${wish ? `心愿：${escapeHTML(wish.title)}` : '还没有记录毕业心愿'}</p>
            </div>
          </div>
          <div class="member-actions">
            <button class="text-button" type="button" data-action="rename-member" data-id="${escapeHTML(member.id)}">改名</button>
            <button class="text-button danger" type="button" data-action="delete-member" data-id="${escapeHTML(member.id)}">移除</button>
          </div>
        </article>`;
    }).join('');

    renderMemberOptions();
  }

  function renderMemberOptions() {
    const currentValue = ideaBySelect.value;
    ideaBySelect.innerHTML = '<option value="">暂未指定</option>' + state.members
      .map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`)
      .join('');
    ideaBySelect.value = state.members.some((member) => member.id === currentValue) ? currentValue : '';
  }

  function renderIdeaForm() {
    ideaSubmit.textContent = editingIdeaId ? '保存修改' : '放入灵感池';
    cancelEditButton.hidden = !editingIdeaId;
  }

  function renderPool() {
    const ideas = poolIdeas();
    poolCount.textContent = ideas.length
      ? `还有 ${ideas.length} 条灵感等待安排`
      : '先记下，再决定放到哪一天';

    if (!ideas.length) {
      poolList.innerHTML = `<div class="empty-state">${state.inspirations.length ? '所有灵感都已经进入日程。' : '从一条小红书收藏、一句群聊推荐，或一个人的毕业心愿开始。'}</div>`;
      return;
    }

    const info = getDateInfo();
    poolList.innerHTML = ideas.map((idea) => {
      const canSchedule = info.status === 'valid';
      return `
        <article class="idea-card ${idea.wish ? 'is-wish' : ''}" data-id="${escapeHTML(idea.id)}">
          <div class="idea-card-header">
            <h4 class="idea-title">${escapeHTML(idea.title)}</h4>
          </div>
          <div class="idea-meta">
            ${idea.byId ? `<span class="tag">${escapeHTML(memberName(idea.byId))} 推荐</span>` : '<span class="tag">暂未指定推荐人</span>'}
            ${idea.wish ? '<span class="tag wish">毕业心愿</span>' : ''}
            ${sourceHTML(idea.source)}
          </div>
          ${idea.note ? `<p class="idea-note">${escapeHTML(idea.note)}</p>` : ''}
          ${canSchedule ? `
            <div class="schedule-row">
              <label class="sr-only" for="day-${escapeHTML(idea.id)}">选择安排到第几天</label>
              <select id="day-${escapeHTML(idea.id)}" data-day-select="${escapeHTML(idea.id)}">
                ${dayOptions(info.count)}
              </select>
              <button class="button button-secondary" type="button" data-action="schedule-idea" data-id="${escapeHTML(idea.id)}">放入日程</button>
            </div>` : `
            <p class="field-hint">先填写有效的目的地日期，才能把灵感排入某一天。</p>`}
          <div class="idea-card-actions">
            <button class="text-button" type="button" data-action="edit-idea" data-id="${escapeHTML(idea.id)}">编辑</button>
            <button class="text-button danger" type="button" data-action="delete-idea" data-id="${escapeHTML(idea.id)}">删除</button>
          </div>
        </article>`;
    }).join('');
  }

  function dayOptions(count) {
    return Array.from({ length: count }, (_, index) => `<option value="${index + 1}">第 ${index + 1} 天</option>`).join('');
  }

  function renderDays() {
    const info = getDateInfo();
    if (info.status !== 'valid') {
      daysTrack.innerHTML = `<div class="empty-state">${escapeHTML(info.message)} 日期有效后，这里会出现可编辑的每日行程。</div>`;
      return;
    }

    daysTrack.innerHTML = info.dates.map((date, index) => {
      const day = index + 1;
      const ideas = state.inspirations
        .filter((idea) => idea.day === day)
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

      return `
        <section class="day-column" aria-label="第 ${day} 天">
          <div class="day-header">
            <div>
              <strong>Day ${day}</strong>
              <span>${formatDate(date)} · ${weekdayName(date)}</span>
            </div>
            <span class="day-count">${ideas.length ? `${ideas.length} 项` : '待安排'}</span>
          </div>
          <div class="day-items">
            ${ideas.length ? ideas.map((idea, itemIndex) => scheduledIdeaHTML(idea, itemIndex, ideas.length)).join('') : '<div class="day-empty">这一天可以先留白，也可以从灵感池放入安排。</div>'}
          </div>
        </section>`;
    }).join('');
  }

  function scheduledIdeaHTML(idea, index, total) {
    return `
      <article class="scheduled-card ${idea.wish ? 'is-wish' : ''}" data-id="${escapeHTML(idea.id)}">
        <div class="scheduled-top">
          <h4 class="scheduled-title">${escapeHTML(idea.title)}</h4>
          <div class="order-controls" aria-label="调整顺序">
            <button class="icon-button" type="button" data-action="move-up" data-id="${escapeHTML(idea.id)}" ${index === 0 ? 'disabled' : ''} aria-label="上移 ${escapeHTML(idea.title)}">↑</button>
            <button class="icon-button" type="button" data-action="move-down" data-id="${escapeHTML(idea.id)}" ${index === total - 1 ? 'disabled' : ''} aria-label="下移 ${escapeHTML(idea.title)}">↓</button>
          </div>
        </div>
        <div class="scheduled-meta">
          ${idea.byId ? `<span class="tag">${escapeHTML(memberName(idea.byId))}</span>` : ''}
          ${idea.wish ? '<span class="tag wish">毕业心愿</span>' : ''}
          ${sourceHTML(idea.source)}
        </div>
        <div class="scheduled-actions">
          <button class="text-button" type="button" data-action="edit-idea" data-id="${escapeHTML(idea.id)}">编辑</button>
          <button class="text-button" type="button" data-action="unschedule-idea" data-id="${escapeHTML(idea.id)}">移回灵感池</button>
          <button class="text-button danger" type="button" data-action="delete-idea" data-id="${escapeHTML(idea.id)}">删除</button>
        </div>
      </article>`;
  }

  function renderReadiness() {
    const info = getDateInfo();
    const scheduled = scheduledIdeas();
    const wishes = state.inspirations.filter((idea) => idea.wish);
    const missingWishes = unscheduledWishes();
    const emptyDays = info.status === 'valid'
      ? Array.from({ length: info.count }, (_, index) => index + 1)
          .filter((day) => !state.inspirations.some((idea) => idea.day === day))
      : [];

    const basicsReady = Boolean(state.trip.destination.trim()) && info.status === 'valid';
    const scheduleReady = scheduled.length > 0;
    const wishesReady = wishes.length > 0 && missingWishes.length === 0;

    readinessList.innerHTML = [
      readinessItem(
        basicsReady,
        '旅行骨架',
        basicsReady ? `${state.trip.destination} · ${info.count} 天` : '先填写目的地与有效日期'
      ),
      readinessItem(
        scheduleReady,
        '日程内容',
        scheduleReady ? `已安排 ${scheduled.length} 条灵感，灵感池还有 ${poolIdeas().length} 条` : '至少把一条灵感放入日程'
      ),
      readinessItem(
        wishesReady,
        '毕业心愿',
        wishes.length
          ? (missingWishes.length ? `还有 ${missingWishes.length} 条心愿未安排` : '已记录的心愿都已进入日程')
          : '可以在添加灵感时标记“不想错过的心愿”'
      ),
      readinessItem(
        true,
        '留白节奏',
        emptyDays.length && info.status === 'valid'
          ? `第 ${emptyDays.join('、')} 天暂时留白，可作为机动时间`
          : '每天都有内容；适当留白也没问题'
      )
    ].join('');

    if (missingWishes.length) {
      wishWarning.hidden = false;
      wishWarning.innerHTML = `
        <strong>发群前请再看一眼</strong>
        ${missingWishes.map((idea) => `“${escapeHTML(idea.title)}”是 ${escapeHTML(memberName(idea.byId))} 的毕业心愿，目前还没有排入日程。`).join('<br>')}`;
    } else {
      wishWarning.hidden = true;
      wishWarning.innerHTML = '';
    }
  }

  function readinessItem(done, title, description) {
    return `
      <div class="readiness-item ${done ? '' : 'pending'}">
        <span class="readiness-icon" aria-hidden="true">${done ? '✓' : '!'}</span>
        <div>
          <strong>${escapeHTML(title)}</strong>
          <p>${escapeHTML(description)}</p>
        </div>
      </div>`;
  }

  function renderPlanSheet() {
    const info = getDateInfo();
    const scheduled = scheduledIdeas();
    const canGenerate = Boolean(state.trip.destination.trim()) && info.status === 'valid' && scheduled.length > 0;
    copyPlanButton.disabled = !canGenerate;
    printPlanButton.disabled = !canGenerate;

    if (!canGenerate) {
      planSheet.innerHTML = `
        <div class="plan-placeholder">
          <div>
            <p class="eyebrow">行程草案</p>
            <h3>完成旅行信息，并安排至少一条灵感</h3>
            <p>这里会实时生成一份可复制的计划。它不会替你编造攻略，只会整理你们已经选择的内容。</p>
          </div>
        </div>`;
      return;
    }

    const tripTitle = state.trip.name.trim() || `${state.trip.destination}毕业旅行`;
    const missingWishes = unscheduledWishes();
    const start = info.dates[0];
    const end = info.dates[info.dates.length - 1];

    planSheet.innerHTML = `
      <header class="plan-sheet-header">
        <p class="plan-sheet-label">行程草案 · 待群内确认</p>
        <h2>${escapeHTML(tripTitle)}</h2>
        <p>${escapeHTML(state.trip.destination)} · ${formatDate(start)}—${formatDate(end)} · ${state.members.length || '未填写'} 位伙伴</p>
      </header>
      <div class="plan-sheet-body">
        ${missingWishes.length ? `
          <div class="plan-warning">
            <strong>成行提醒</strong>
            ${missingWishes.map((idea) => `“${escapeHTML(idea.title)}”是 ${escapeHTML(memberName(idea.byId))} 的毕业心愿，目前仍在灵感池。`).join('<br>')}
          </div>` : ''}
        ${info.dates.map((date, index) => planDayHTML(date, index + 1)).join('')}
      </div>
      <footer class="plan-footer">由 GradTrip 整理 · 讨论与确认请回到群聊 · 来源仅用于回溯原始攻略</footer>`;
  }

  function planDayHTML(date, day) {
    const ideas = state.inspirations
      .filter((idea) => idea.day === day)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

    return `
      <section class="plan-day">
        <div class="plan-day-title">
          <strong>Day ${day}</strong>
          <span>${formatDate(date)} · ${weekdayName(date)}</span>
        </div>
        ${ideas.length ? `
          <ol class="plan-items">
            ${ideas.map((idea) => `
              <li>
                <p class="plan-item-title">${escapeHTML(idea.title)}${idea.wish ? ' · 毕业心愿' : ''}</p>
                <p class="plan-item-meta">${escapeHTML(memberName(idea.byId))} 推荐${idea.source ? ` · 来源：${escapeHTML(sourceLabel(idea.source))}` : ''}</p>
                ${idea.note ? `<p class="plan-item-note">${escapeHTML(idea.note)}</p>` : ''}
              </li>`).join('')}
          </ol>` : '<p class="plan-empty-day">留白 / 机动安排</p>'}
      </section>`;
  }

  function buildPlanText() {
    const info = getDateInfo();
    const scheduled = scheduledIdeas();
    const tripTitle = state.trip.name.trim() || `${state.trip.destination}毕业旅行`;
    const missingWishes = unscheduledWishes();
    const lines = [
      `【${tripTitle}】`,
      `${state.trip.destination} · ${formatDate(info.dates[0])}—${formatDate(info.dates[info.dates.length - 1])} · ${state.members.length || '未填写'} 位伙伴`,
      '状态：行程草案，请大家确认'
    ];

    if (state.members.length) {
      lines.push(`同行伙伴：${state.members.map((member) => member.name).join('、')}`);
    }

    if (missingWishes.length) {
      lines.push('', '成行提醒：');
      missingWishes.forEach((idea) => {
        lines.push(`- “${idea.title}”是 ${memberName(idea.byId)} 的毕业心愿，目前还没有排入日程。`);
      });
    }

    info.dates.forEach((date, index) => {
      const day = index + 1;
      const ideas = scheduled.filter((idea) => idea.day === day);
      lines.push('', `Day ${day} · ${formatDate(date)} ${weekdayName(date)}`);
      if (!ideas.length) {
        lines.push('1. 留白 / 机动安排');
        return;
      }
      ideas.forEach((idea, ideaIndex) => {
        const extras = [memberName(idea.byId) ? `${memberName(idea.byId)}推荐` : '', idea.wish ? '毕业心愿' : '', idea.source ? `来源：${sourceLabel(idea.source)}` : '']
          .filter(Boolean)
          .join(' · ');
        lines.push(`${ideaIndex + 1}. ${idea.title}${extras ? `（${extras}）` : ''}`);
        if (idea.note) lines.push(`   备注：${idea.note}`);
        if (idea.source && isHttpUrl(idea.source)) lines.push(`   链接：${idea.source}`);
      });
    });

    lines.push('', '—— 由 GradTrip 整理，讨论与确认请继续在群里进行');
    return lines.join('\n');
  }

  async function copyPlan() {
    if (copyPlanButton.disabled) return;
    const text = buildPlanText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      showToast('行程草案已复制，可以发回群里确认。', 'success');
    } catch (error) {
      fallbackCopy(text);
      showToast('行程草案已复制。', 'success');
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 3000);
  }

  function askConfirm({ title, body, confirmText = '确认' }) {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmOk.textContent = confirmText;
    confirmModal.hidden = false;
    document.body.style.overflow = 'hidden';
    confirmOk.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(result) {
    if (confirmModal.hidden) return;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
  }

  function hasMeaningfulData() {
    return Boolean(
      state.trip.name.trim() ||
      state.trip.destination.trim() ||
      state.trip.start ||
      state.trip.end ||
      state.members.length ||
      state.inspirations.length
    );
  }

  async function loadDemo(scrollAfter = false) {
    if (hasMeaningfulData()) {
      const accepted = await askConfirm({
        title: '载入完整示例？',
        body: '当前浏览器中的旅行内容会被示例覆盖。建议先复制或打印已有计划。',
        confirmText: '覆盖并载入'
      });
      if (!accepted) return;
    }

    state = createSampleState();
    editingIdeaId = null;
    editingMemberId = null;
    clearIdeaForm();
    persist();
    render();
    if (scrollAfter) $('#planner').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('示例已载入：注意“玉林路小酒馆”的心愿提醒。', 'success');
  }

  async function resetAll() {
    if (!hasMeaningfulData()) return;
    const accepted = await askConfirm({
      title: '清空这次旅行？',
      body: '旅行信息、伙伴、灵感和日程都会从当前浏览器删除，且无法恢复。',
      confirmText: '全部清空'
    });
    if (!accepted) return;
    state = createEmptyState();
    editingIdeaId = null;
    editingMemberId = null;
    clearIdeaForm();
    memberNameInput.value = '';
    persist();
    render();
    showToast('已清空，可以重新开始。');
  }

  function createSampleState() {
    const start = addDays(new Date(), 21);
    const end = addDays(start, 2);
    const members = ['阿柚', '大白', '小满', '老K'].map((name) => ({ id: uid(), name }));
    const byName = Object.fromEntries(members.map((member) => [member.name, member.id]));
    const baseTime = Date.now();
    const idea = (title, by, source, note, wish, day, order, offset) => ({
      id: uid(),
      title,
      byId: byName[by] || '',
      source,
      note,
      wish,
      day,
      order,
      createdAt: new Date(baseTime + offset).toISOString()
    });

    return {
      version: 2,
      trip: {
        name: '我们的成都毕业旅行',
        destination: '成都',
        start: toISODate(start),
        end: toISODate(end)
      },
      members,
      inspirations: [
        idea('集合入住后去玉林路吃火锅', '阿柚', '微信群', '第一晚先吃饱，别安排太赶。', false, 1, 1, 1),
        idea('大熊猫基地看花花', '大白', 'https://www.panda.org.cn/', '尽量赶早场，下午容易人多。', true, 2, 1, 2),
        idea('东郊记忆拍毕业照', '老K', '小红书收藏', '带一件浅色衣服，傍晚光线更好。', true, 2, 2, 3),
        idea('人民公园喝茶', '阿柚', '小红书收藏', '留一个下午慢慢聊未来。', true, 3, 1, 4),
        idea('玉林路小酒馆听一次现场', '小满', '朋友推荐', '这是我最想完成的毕业仪式。', true, null, 0, 5),
        idea('太古里夜景散步', '大白', '微信群', '如果前两天不累，可以临时加入。', false, null, 0, 6)
      ],
      updatedAt: new Date().toISOString()
    };
  }

  function clearIdeaForm() {
    editingIdeaId = null;
    ideaTitleInput.value = '';
    ideaBySelect.value = '';
    ideaSourceInput.value = '';
    ideaNoteInput.value = '';
    ideaWishInput.checked = false;
    setFieldError(ideaError, '');
    renderIdeaForm();
  }

  function handleIdeaSubmit(event) {
    event.preventDefault();
    const title = safeText(ideaTitleInput.value, 40);
    const byId = ideaBySelect.value;
    const source = safeText(ideaSourceInput.value, 160);
    const note = safeText(ideaNoteInput.value, 120);
    const wish = ideaWishInput.checked;

    if (!title) {
      setFieldError(ideaError, '先给这条灵感起一个名字，例如“人民公园喝茶”。');
      ideaTitleInput.focus();
      return;
    }
    if (wish && !byId) {
      setFieldError(ideaError, '毕业心愿需要选择推荐人，这样才知道不能落下谁。');
      ideaBySelect.focus();
      return;
    }
    if (wish) {
      const existingWish = state.inspirations.find((idea) => idea.wish && idea.byId === byId && idea.id !== editingIdeaId);
      if (existingWish) {
        setFieldError(ideaError, `${memberName(byId)} 已经有一个毕业心愿：“${existingWish.title}”。先编辑原心愿，或取消当前勾选。`);
        return;
      }
    }

    if (editingIdeaId) {
      const idea = state.inspirations.find((item) => item.id === editingIdeaId);
      if (!idea) {
        clearIdeaForm();
        render();
        return;
      }
      Object.assign(idea, { title, byId, source, note, wish });
      showToast('灵感已更新。', 'success');
    } else {
      state.inspirations.push({
        id: uid(),
        title,
        byId,
        source,
        note,
        wish,
        day: null,
        order: 0,
        createdAt: new Date().toISOString()
      });
      showToast('已放入灵感池。', 'success');
    }

    clearIdeaForm();
    persist();
    render();
  }

  function startEditIdea(id) {
    const idea = state.inspirations.find((item) => item.id === id);
    if (!idea) return;
    editingIdeaId = id;
    ideaTitleInput.value = idea.title;
    renderMemberOptions();
    ideaBySelect.value = idea.byId;
    ideaSourceInput.value = idea.source;
    ideaNoteInput.value = idea.note;
    ideaWishInput.checked = idea.wish;
    setFieldError(ideaError, '');
    renderIdeaForm();
    ideaTitleInput.focus();
    ideaTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deleteIdea(id) {
    const idea = state.inspirations.find((item) => item.id === id);
    if (!idea) return;
    const accepted = await askConfirm({
      title: '删除这条灵感？',
      body: `“${idea.title}”会从灵感池、日程和最终计划中移除。`,
      confirmText: '删除'
    });
    if (!accepted) return;
    state.inspirations = state.inspirations.filter((item) => item.id !== id);
    if (editingIdeaId === id) clearIdeaForm();
    normalizeDayOrders();
    persist();
    render();
    showToast('灵感已删除。');
  }

  function scheduleIdea(id) {
    const idea = state.inspirations.find((item) => item.id === id);
    const info = getDateInfo();
    if (!idea || info.status !== 'valid') return;
    const select = document.querySelector(`[data-day-select="${CSS.escape(id)}"]`);
    const day = Number(select && select.value);
    if (!Number.isInteger(day) || day < 1 || day > info.count) return;
    const maxOrder = Math.max(0, ...state.inspirations.filter((item) => item.day === day).map((item) => item.order));
    idea.day = day;
    idea.order = maxOrder + 1;
    normalizeDayOrders();
    persist();
    render();
    showToast(`已放入第 ${day} 天。`, 'success');
  }

  function unscheduleIdea(id) {
    const idea = state.inspirations.find((item) => item.id === id);
    if (!idea) return;
    idea.day = null;
    idea.order = 0;
    normalizeDayOrders();
    persist();
    render();
    showToast('已移回灵感池。');
  }

  function moveIdea(id, direction) {
    const idea = state.inspirations.find((item) => item.id === id);
    if (!idea || idea.day === null) return;
    const siblings = state.inspirations
      .filter((item) => item.day === idea.day)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const index = siblings.findIndex((item) => item.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    [siblings[index].order, siblings[targetIndex].order] = [siblings[targetIndex].order, siblings[index].order];
    normalizeDayOrders();
    persist();
    render();
  }

  function normalizeDayOrders() {
    const info = getDateInfo();
    const maxDay = info.status === 'valid' ? info.count : 0;
    const byDay = new Map();
    state.inspirations.forEach((idea) => {
      if (idea.day !== null && maxDay && idea.day > maxDay) {
        idea.day = null;
        idea.order = 0;
      }
      if (idea.day !== null) {
        if (!byDay.has(idea.day)) byDay.set(idea.day, []);
        byDay.get(idea.day).push(idea);
      }
    });
    byDay.forEach((ideas) => {
      ideas.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      ideas.forEach((idea, index) => {
        idea.order = index + 1;
      });
    });
  }

  function handleMemberSubmit(event) {
    event.preventDefault();
    const name = safeText(memberNameInput.value, 12);
    if (!name) {
      setFieldError(memberError, '先填写伙伴昵称。');
      memberNameInput.focus();
      return;
    }
    const duplicate = state.members.some((member) => member.name.toLowerCase() === name.toLowerCase() && member.id !== editingMemberId);
    if (duplicate) {
      setFieldError(memberError, '这个昵称已经添加过了。');
      memberNameInput.focus();
      return;
    }

    if (editingMemberId) {
      const member = memberById(editingMemberId);
      if (member) {
        member.name = name;
        showToast('昵称已更新。', 'success');
      }
      editingMemberId = null;
    } else {
      if (state.members.length >= MAX_MEMBERS) {
        setFieldError(memberError, `当前版本最多记录 ${MAX_MEMBERS} 位伙伴，先聚焦一个常见毕业旅行小组。`);
        return;
      }
      state.members.push({ id: uid(), name });
      showToast(`${name} 已加入同行伙伴。`, 'success');
    }

    memberNameInput.value = '';
    setFieldError(memberError, '');
    persist();
    render();
  }

  function startRenameMember(id) {
    const member = memberById(id);
    if (!member) return;
    editingMemberId = id;
    memberNameInput.value = member.name;
    memberSubmit.textContent = '保存昵称';
    memberCancel.hidden = false;
    memberNameInput.focus();
  }

  async function deleteMember(id) {
    const member = memberById(id);
    if (!member) return;
    const related = state.inspirations.filter((idea) => idea.byId === id);
    const accepted = await askConfirm({
      title: `移除 ${member.name}？`,
      body: related.length
        ? `同时会移除 ${member.name} 推荐的 ${related.length} 条灵感/心愿。这个操作无法撤销。`
        : `${member.name} 没有关联灵感，可以从伙伴列表移除。`,
      confirmText: '移除'
    });
    if (!accepted) return;

    state.members = state.members.filter((item) => item.id !== id);
    state.inspirations = state.inspirations.filter((idea) => idea.byId !== id);
    if (editingMemberId === id) {
      editingMemberId = null;
      memberNameInput.value = '';
    }
    if (editingIdeaId) {
      const editingIdea = state.inspirations.find((idea) => idea.id === editingIdeaId);
      if (!editingIdea) clearIdeaForm();
    }
    normalizeDayOrders();
    persist();
    render();
    showToast(`${member.name} 已移除。`);
  }

  function updateTripTextField(field, value) {
    state.trip[field] = safeText(value, field === 'name' ? 30 : 20);
    persist();
    render();
  }

  async function updateTripDateField(field, value) {
    const previous = { ...state.trip };
    const next = { ...state.trip, [field]: value };
    const previousInfo = getDateInfo();
    state.trip = next;
    const nextInfo = getDateInfo();

    if (previousInfo.status === 'valid' && nextInfo.status === 'valid' && nextInfo.count < previousInfo.count) {
      const affected = state.inspirations.filter((idea) => idea.day !== null && idea.day > nextInfo.count);
      if (affected.length) {
        const accepted = await askConfirm({
          title: '缩短旅行日期？',
          body: `第 ${nextInfo.count + 1} 天及之后的 ${affected.length} 条安排会移回灵感池，不会被删除。`,
          confirmText: '缩短日期'
        });
        if (!accepted) {
          state.trip = previous;
          render();
          return;
        }
        affected.forEach((idea) => {
          idea.day = null;
          idea.order = 0;
        });
      }
    }

    normalizeDayOrders();
    persist();
    render();
  }

  async function handleGlobalClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const { action, id, scrollAfter } = actionElement.dataset;

    if (action === 'load-demo') {
      await loadDemo(scrollAfter === 'true');
      return;
    }
    if (action === 'reset-all') {
      await resetAll();
      return;
    }
    if (!id) return;

    if (action === 'schedule-idea') scheduleIdea(id);
    if (action === 'unschedule-idea') unscheduleIdea(id);
    if (action === 'edit-idea') startEditIdea(id);
    if (action === 'delete-idea') await deleteIdea(id);
    if (action === 'move-up') moveIdea(id, -1);
    if (action === 'move-down') moveIdea(id, 1);
    if (action === 'rename-member') startRenameMember(id);
    if (action === 'delete-member') await deleteMember(id);
  }

  function bindEvents() {
    ideaForm.addEventListener('submit', handleIdeaSubmit);
    memberForm.addEventListener('submit', handleMemberSubmit);
    cancelEditButton.addEventListener('click', () => {
      clearIdeaForm();
      render();
    });
    memberCancel.addEventListener('click', () => {
      editingMemberId = null;
      memberNameInput.value = '';
      setFieldError(memberError, '');
      renderMembers();
    });
    copyPlanButton.addEventListener('click', copyPlan);
    printPlanButton.addEventListener('click', () => {
      if (!printPlanButton.disabled) window.print();
    });

    tripNameInput.addEventListener('input', () => updateTripTextField('name', tripNameInput.value));
    destinationInput.addEventListener('input', () => updateTripTextField('destination', destinationInput.value));
    startDateInput.addEventListener('change', () => updateTripDateField('start', startDateInput.value));
    endDateInput.addEventListener('change', () => updateTripDateField('end', endDateInput.value));

    memberNameInput.addEventListener('input', () => setFieldError(memberError, ''));
    ideaTitleInput.addEventListener('input', () => setFieldError(ideaError, ''));
    ideaBySelect.addEventListener('change', () => setFieldError(ideaError, ''));
    ideaWishInput.addEventListener('change', () => setFieldError(ideaError, ''));

    document.addEventListener('click', (event) => {
      handleGlobalClick(event).catch((error) => {
        console.error(error);
        showToast('操作没有完成，请再试一次。', 'error');
      });
    });

    confirmOk.addEventListener('click', () => closeConfirm(true));
    confirmCancel.addEventListener('click', () => closeConfirm(false));
    confirmModal.addEventListener('click', (event) => {
      if (event.target === confirmModal) closeConfirm(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !confirmModal.hidden) closeConfirm(false);
    });
  }

  $('#year').textContent = String(new Date().getFullYear());
  normalizeDayOrders();
  bindEvents();
  render();
  window.GradTripReady = true;
})();
