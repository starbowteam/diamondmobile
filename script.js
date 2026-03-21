// ==================== СОСТОЯНИЕ ====================
let currentChatId = null;
let chats = [];
let userApiKey = null;
let isWaitingForResponse = false;
let currentAbortController = null;
let lastNotificationTime = 0;
const NOTIFICATION_DEBOUNCE = 1000;
let lastChatCreationTime = 0;
const CHAT_CREATION_COOLDOWN = 1000;
let userAvatar = { type: 'icon', value: 'fa-user' };

const REQUEST_TIMEOUT = 30000;

// ==================== ПРОМПТ (кешируем) ====================
const SYSTEM_PROMPT = {
  role: 'system',
  content: `Ты — DIAMOND AI, абсолютный эксперт и идеальный собеседник. Создан viktorshopa — основателем сети Diamond. Твоя задача — быть полезным в любой ситуации: от глубоких научных дискуссий до дружеского общения.

📚 **Твои знания безграничны:**
- **Химия**: используй \ce{} для формул: \ce{H2O}, \ce{CH3COOH + NaOH -> CH3COONa + H2O}.
- **Физика**: используй $$ для формул.
- **Математика**: дроби \frac{}{}, корни \sqrt{}, интегралы \int.
- **И многое другое**: биология, информатика, история, литература, философия, искусство, спорт, кулинария, медицина, политика, экономика, право, инженерия, география, астрономия, психология, социология, лингвистика, педагогика, экология, сельское хозяйство, военное дело.

🎭 **Ты чувствуешь стиль общения:**
- Если пользователь пишет серьёзно — режим **профессора**.
- Если по‑пацански — **разговорный стиль**.
- На сложные вопросы отвечай полно, на простые — кратко.

**Правила оформления:**
- Химия: \ce{}.
- Математика: $$, \frac{}, \sqrt{}, \int.
- Код: в тройных кавычках с указанием языка.`
};

// Приоритетные модели (быстрые и бесплатные)
const PRIORITY_MODELS = [
  'arcee-ai/pony-alpha-7b:free',
  'stepfun/step-3.5-flash:free',
  'liquid/lfm-2.5-1.2b-instruct:free'
];

// ==================== НАСТРОЙКА KATEX ====================
if (typeof markedKatex !== 'undefined') {
  marked.use(markedKatex({
    throwOnError: false,
    output: 'html',
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true }
    ]
  }));
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const welcomeScreen = document.getElementById('welcomeScreen');
const errorScreen = document.getElementById('errorScreen');
const mainUI = document.getElementById('mainUI');
const messagesContainer = document.getElementById('messagesContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const burgerBtn = document.getElementById('burgerBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const discordBtn = document.getElementById('discordBtn');
const telegramBtn = document.getElementById('telegramBtn');
const avatarBtn = document.getElementById('avatarBtn');
const avatarModal = document.getElementById('avatarModal');
const closeAvatarModal = document.getElementById('closeAvatarModal');
const avatarIcons = document.querySelectorAll('.avatar-icon');
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const resetAvatarBtn = document.getElementById('resetAvatarBtn');
const toastContainer = document.getElementById('toastContainer');

// Элементы загрузки
const loadingStatus = document.getElementById('loadingStatus');
const loadingBar = document.getElementById('loadingBar');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
function getBotAvatarHTML() {
  const containerId = 'bot-avatar-' + Math.random().toString(36).substring(2);
  const html = `<div id="${containerId}" style="width:100%; height:100%; border-radius:50%; background:#3a3a3a; display:flex; align-items:center; justify-content:center;"><span style="color:#fff; font-weight:bold;">AI</span></div>`;
  setTimeout(() => {
    const container = document.getElementById(containerId);
    if (container && !container.querySelector('img')) {
      container.innerHTML = '<span style="color:#fff; font-weight:bold;">AI</span>';
    }
  }, 0);
  return html;
}

function getUserAvatarHTML() {
  if (userAvatar.type === 'icon') {
    return `<i class="fas ${userAvatar.value}"></i>`;
  } else if (userAvatar.type === 'custom' && userAvatar.dataUrl) {
    return `<img src="${userAvatar.dataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  }
  return '<i class="fas fa-user"></i>';
}

function showToast(title, message, type = 'info', duration = 3000) {
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_DEBOUNCE) return;
  lastNotificationTime = now;
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-check-circle';
  else if (type === 'warning') icon = 'fa-exclamation-triangle';
  else if (type === 'error') icon = 'fa-exclamation-circle';
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close"><i class="fas fa-times"></i></button>
  `;
  toastContainer.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  setTimeout(() => toast.remove(), duration);
}

// ==================== ЗАГРУЗОЧНЫЙ ЭКРАН ====================
async function showLoadingScreen() {
  welcomeScreen.style.display = 'flex';
  const statuses = ["Загрузка нейросети...", "Активация кристаллов...", "Калибровка ответов...", "Запуск DIAMOND AI..."];
  let idx = 0;
  const statusInterval = setInterval(() => {
    idx = (idx + 1) % statuses.length;
    if (loadingStatus) loadingStatus.textContent = statuses[idx];
  }, 1500);
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 1;
    if (loadingBar) loadingBar.style.width = progress + '%';
    if (progress >= 100) clearInterval(progressInterval);
  }, 70);
  await new Promise(r => setTimeout(r, 5000));
  clearInterval(statusInterval);
  clearInterval(progressInterval);
  welcomeScreen.classList.add('fade-out');
  await new Promise(r => setTimeout(r, 500));
}

// ==================== ПОЛУЧЕНИЕ КЛЮЧА С СЕРВЕРА ====================
async function fetchServerKey() {
  try {
    const response = await fetch('/api/get-key');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.key || null;
  } catch (error) {
    console.error('Ошибка получения ключа:', error);
    return null;
  }
}

// ==================== ПРОВЕРКА КЛЮЧА ====================
async function checkKeyBalance(apiKey) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) return false;
    const data = await response.json();
    // Для бесплатных ключей может не быть лимита, считаем валидным
    return true;
  } catch (error) {
    console.error('Ошибка проверки ключа:', error);
    return false;
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
(async function init() {
  // Загрузка чатов
  try {
    const stored = localStorage.getItem('diamondChats');
    if (stored) {
      chats = JSON.parse(stored);
      chats = chats.filter(chat => chat && chat.id && Array.isArray(chat.messages));
    } else {
      chats = [];
    }
  } catch (e) {
    chats = [];
  }

  // Загрузка аватара
  try {
    const saved = localStorage.getItem('userAvatar');
    if (saved) userAvatar = JSON.parse(saved);
  } catch { /* ignore */ }

  await showLoadingScreen();
  welcomeScreen.style.display = 'none';

  const serverKey = await fetchServerKey();
  if (!serverKey) {
    errorScreen.style.display = 'flex';
    return;
  }

  const isValid = await checkKeyBalance(serverKey);
  if (!isValid) {
    errorScreen.style.display = 'flex';
    return;
  }

  userApiKey = serverKey;
  mainUI.style.display = 'flex';
  setTimeout(() => mainUI.classList.add('visible'), 50);

  if (chats.length > 0) {
    if (!currentChatId || !chats.find(c => c.id === currentChatId)) {
      currentChatId = chats[0].id;
    }
    renderChat();
    renderHistory();
  } else {
    createNewChat(true);
  }

  updateSendButtonState();
  setupEventListeners();
})();

// ==================== ЧАТЫ ====================
function saveChats() {
  localStorage.setItem('diamondChats', JSON.stringify(chats));
  renderHistory();
}

function generateChatTitle(userMessage) {
  if (!userMessage) return 'Новый диалог';
  let title = userMessage.trim();
  if (title.length > 50) {
    let truncated = title.substring(0, 50);
    let lastSpace = truncated.lastIndexOf(' ');
    title = lastSpace > 30 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }
  return title;
}

function createNewChat(force = false) {
  if (!force && chats.length > 0 && isCurrentChatEmpty()) {
    showToast('⚠️ Нельзя создать новый чат', 'Сначала напишите что-нибудь', 'warning');
    return;
  }
  const now = Date.now();
  if (now - lastChatCreationTime < CHAT_CREATION_COOLDOWN) {
    showToast('⏳ Подождите', 'Не так быстро', 'warning');
    return;
  }
  lastChatCreationTime = now;
  const newChat = {
    id: Date.now().toString(),
    title: 'Новый диалог',
    messages: [{
      role: 'assistant',
      content: 'Здравствуй, я Diamond AI. Чем могу помочь?',
      timestamp: Date.now()
    }],
    createdAt: Date.now(),
    pinned: false
  };
  chats.unshift(newChat);
  currentChatId = newChat.id;
  saveChats();
  renderChat();
}

function deleteChat(chatId) {
  chats = chats.filter(chat => chat.id !== chatId);
  if (chats.length === 0) createNewChat(true);
  else {
    if (currentChatId === chatId) currentChatId = chats[0].id;
    saveChats();
    renderChat();
  }
}

function switchChat(chatId) {
  currentChatId = chatId;
  renderChat();
  renderHistory();
}

function togglePin(chatId) {
  const chat = chats.find(c => c.id === chatId);
  if (chat) { chat.pinned = !chat.pinned; saveChats(); }
}

function isCurrentChatEmpty() {
  const chat = chats.find(c => c.id === currentChatId);
  return !chat || !chat.messages.some(m => m.role === 'user');
}

// ==================== ФОРМАТИРОВАНИЕ ====================
function formatDateHeader(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ==================== РЕНДЕР ЧАТА ====================
function renderChat() {
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) { createNewChat(true); return; }
  messagesContainer.innerHTML = '';
  let lastDate = null;
  chat.messages.forEach((msg, idx) => {
    const msgDate = new Date(msg.timestamp || chat.createdAt + idx * 1000).toDateString();
    if (msgDate !== lastDate) {
      const divider = document.createElement('div');
      divider.className = 'date-divider';
      divider.innerHTML = `<span>${formatDateHeader(msg.timestamp || chat.createdAt)}</span>`;
      messagesContainer.appendChild(divider);
      lastDate = msgDate;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.role}`;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = msg.role === 'user' ? getUserAvatarHTML() : getBotAvatarHTML();
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (msg.role === 'assistant' && typeof marked !== 'undefined') {
      contentDiv.innerHTML = marked.parse(msg.content);
    } else {
      contentDiv.textContent = msg.content;
    }
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(msg.timestamp || Date.now());
    contentWrapper.appendChild(contentDiv);
    contentWrapper.appendChild(timeDiv);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentWrapper);
    // Кнопки копирования/регенерации
    if (msg.role === 'assistant') {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
      copyBtn.title = 'Копировать';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(msg.content);
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 1000);
      };
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'action-btn';
      regenerateBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
      regenerateBtn.title = 'Перегенерировать';
      regenerateBtn.onclick = (e) => { e.stopPropagation(); regenerateResponse(msg); };
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(regenerateBtn);
      messageDiv.appendChild(actionsDiv);
    }
    messagesContainer.appendChild(messageDiv);
  });
  scrollToBottom();
}

function addMessageToDOM(role, content, save = true) {
  const timestamp = Date.now();
  const messageId = Date.now().toString() + Math.random();
  if (save) {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      chat.messages.push({ id: messageId, role, content, timestamp });
      if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        chat.title = generateChatTitle(content);
      }
      saveChats();
    }
  }
  renderChat();
  return messageId;
}

async function regenerateResponse(oldMsg) {
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;
  const index = chat.messages.findIndex(m => m === oldMsg);
  if (index !== -1) {
    chat.messages.splice(index, 1);
    saveChats();
    renderChat();
  }
  const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    userInput.value = lastUserMsg.content;
    sendMessage();
  }
}

// ==================== ИНДИКАТОР "ДУМАЕТ..." ====================
function createTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message assistant typing';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = '<span>Думает</span><span class="dots">...</span>';
  const wrapper = document.createElement('div');
  wrapper.className = 'message-content-wrapper';
  wrapper.appendChild(contentDiv);
  div.innerHTML = `<div class="avatar">${getBotAvatarHTML()}</div>`;
  div.appendChild(wrapper);
  return div;
}

// ==================== ПРЕДОБРАБОТКА ====================
function preprocessQuery(text) {
  let processed = text.trim();
  processed = processed.replace(/\bNAOH\b/gi, 'NaOH');
  processed = processed.replace(/\bNaOh\b/g, 'NaOH');
  return processed;
}

// ==================== ОТПРАВКА СООБЩЕНИЯ (оптимизировано) ====================
async function sendMessage() {
  if (!userApiKey) {
    showToast('⚠️ Требуется вход', 'Сначала войдите', 'warning');
    return;
  }
  if (isWaitingForResponse) {
    showToast('⏳ Ожидание', 'Дождитесь ответа', 'warning');
    return;
  }
  const rawText = userInput.value.trim();
  if (!rawText) return;
  const text = preprocessQuery(rawText);

  isWaitingForResponse = true;
  updateSendButtonState();
  addMessageToDOM('user', rawText, true);
  userInput.value = '';
  userInput.style.height = 'auto';

  const typingDiv = createTypingIndicator();
  messagesContainer.appendChild(typingDiv);
  scrollToBottom();

  const chat = chats.find(c => c.id === currentChatId);
  const contextMessages = chat.messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
  const messages = [SYSTEM_PROMPT, ...contextMessages, { role: 'user', content: text }];

  currentAbortController = new AbortController();
  const timeoutId = setTimeout(() => currentAbortController.abort(), REQUEST_TIMEOUT);

  let success = false;
  for (const model of PRIORITY_MODELS) {
    if (success) break;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'DIAMOND AI Mobile'
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: 0.5,
          max_tokens: 2000
        }),
        signal: currentAbortController.signal
      });

      if (!response.ok) {
        if (response.status === 402) {
          showToast('💸 Баланс исчерпан', 'Ключ истек', 'error');
          break;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      let assistantMessage = data.choices[0]?.message?.content || '';
      if (!assistantMessage) continue;

      typingDiv.remove();
      addMessageToDOM('assistant', assistantMessage, true);
      success = true;
      break;
    } catch (error) {
      if (error.name === 'AbortError') {
        showToast('⏱️ Таймаут', 'Модель не отвечает', 'warning');
      } else {
        console.error(error);
      }
    }
  }

  clearTimeout(timeoutId);
  if (!success) {
    typingDiv.remove();
    addMessageToDOM('assistant', 'Извините, сейчас проблемы с подключением к нейросети. Попробуйте ещё раз.', true);
  }

  isWaitingForResponse = false;
  updateSendButtonState();
  currentAbortController = null;
}

function scrollToBottom() {
  if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
function updateSendButtonState() {
  sendBtn.disabled = !userInput.value.trim() || isWaitingForResponse;
}

// ==================== ИСТОРИЯ ====================
function renderHistory() {
  if (!historyList) return;
  const searchTerm = historySearch ? historySearch.value.toLowerCase() : '';
  const filtered = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchTerm) ||
    chat.messages.some(m => m.role === 'user' && m.content.toLowerCase().includes(searchTerm))
  );
  const sorted = [...filtered.filter(c => c.pinned), ...filtered.filter(c => !c.pinned)];
  historyList.innerHTML = sorted.map(chat => `
    <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" data-id="${chat.id}">
      <button class="pin-chat ${chat.pinned ? 'pinned' : ''}" data-id="${chat.id}"><i class="fas fa-thumbtack"></i></button>
      <span class="chat-title">${chat.title}</span>
      <button class="delete-chat" data-id="${chat.id}"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
  document.querySelectorAll('.history-item').forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.pin-chat') && !e.target.closest('.delete-chat')) switchChat(id);
    });
  });
  document.querySelectorAll('.pin-chat').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(btn.dataset.id); });
  });
  document.querySelectorAll('.delete-chat').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteChat(btn.dataset.id); });
  });
}

// ==================== АВАТАР ====================
function saveAvatar(avatarData) {
  localStorage.setItem('userAvatar', JSON.stringify(avatarData));
  userAvatar = avatarData;
  renderChat();
}
avatarBtn?.addEventListener('click', () => {
  avatarModal.style.display = 'flex';
  avatarIcons.forEach(icon => {
    const iconClass = icon.dataset.icon;
    if (userAvatar.type === 'icon' && userAvatar.value === iconClass) icon.classList.add('selected');
    else icon.classList.remove('selected');
  });
});
closeAvatarModal?.addEventListener('click', () => avatarModal.style.display = 'none');
avatarIcons.forEach(icon => {
  icon.addEventListener('click', () => {
    saveAvatar({ type: 'icon', value: icon.dataset.icon });
    avatarModal.style.display = 'none';
  });
});
uploadAvatarBtn?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        saveAvatar({ type: 'custom', dataUrl: event.target.result });
        avatarModal.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
});
resetAvatarBtn?.addEventListener('click', () => {
  saveAvatar({ type: 'icon', value: 'fa-user' });
  avatarModal.style.display = 'none';
});

// ==================== ОБРАБОТЧИКИ ====================
function setupEventListeners() {
  if (userInput) {
    userInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      updateSendButtonState();
    });
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  sendBtn?.addEventListener('click', sendMessage);
  newChatBtn?.addEventListener('click', () => createNewChat());
  burgerBtn?.addEventListener('click', () => {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
  });
  sidebarOverlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  });
  discordBtn?.addEventListener('click', () => window.open('https://discord.gg/diamondshop', '_blank'));
  telegramBtn?.addEventListener('click', () => window.open('https://t.me/+XbHQYFgGLXpkOTEy', '_blank'));
  historySearch?.addEventListener('input', renderHistory);
  window.addEventListener('click', (e) => {
    if (e.target === avatarModal) avatarModal.style.display = 'none';
  });
}
