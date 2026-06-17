document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('save-btn');
  const viewBtn = document.getElementById('view-btn');
  const optionsBtn = document.getElementById('options-btn');

  // Always bind navigation — works on any page
  viewBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('jobs.html') });
  });
  optionsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('jobs.html') + '#settings' });
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    saveBtn.disabled = true;
    setStatus('Open a job posting to save it.', 'muted');
    return;
  }

  const { exists, job: existingJob } = await chrome.runtime.sendMessage({
    type: 'CHECK_URL',
    url,
  });

  if (exists) {
    markSaved(saveBtn);
    setStatus(`${existingJob.role} @ ${existingJob.company}`, 'muted');
    return;
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Parsing…';
    setStatus('', '');

    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_JOB',
      url,
      tabId: tab.id,
    });

    if (res.success) {
      markSaved(saveBtn);
      setStatus(`${res.job.role} @ ${res.job.company}`, 'success');
    } else {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save This Job';
      if (res.error === 'duplicate') {
        markSaved(saveBtn);
        setStatus('Already in your list.', 'muted');
      } else if (res.error === 'no_api_key') {
        setStatus('No API key — open Settings first.', 'error');
      } else if (res.error === 'scrape_failed') {
        setStatus('Could not read page text.', 'error');
      } else {
        setStatus(`Parse failed: ${res.detail || res.error}`, 'error');
      }
    }
  });
});

function markSaved(btn) {
  btn.textContent = '✓ Saved';
  btn.disabled = true;
  btn.classList.add('saved');
}

function setStatus(text, type) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status' + (type ? ' ' + type : '');
}
