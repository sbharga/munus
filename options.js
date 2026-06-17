document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelInput = document.getElementById('model');
  const toggleBtn = document.getElementById('toggle-key');
  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');

  const settings = await chrome.storage.sync.get(['apiKey', 'model']);
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.model) modelInput.value = settings.model;

  toggleBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? 'Hide' : 'Show';
  });

  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (!apiKey) {
      setStatus('API key is required.', 'error');
      return;
    }

    saveBtn.disabled = true;
    await chrome.storage.sync.set({ apiKey, model });
    setStatus('Saved!', 'success');
    setTimeout(() => {
      setStatus('', '');
      saveBtn.disabled = false;
    }, 2000);
  });

  function setStatus(text, type) {
    saveStatus.textContent = text;
    saveStatus.className = 'save-status' + (type ? ' ' + type : '');
  }
});
