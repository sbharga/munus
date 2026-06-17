const STATUSES = ['saved', 'applied', 'interviewing', 'offered', 'rejected'];

let allJobs = [];
let sortState = { col: 'savedAt', dir: 'desc' };
let filterState = { query: '', status: '' };
let selectedIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const { jobs } = await chrome.runtime.sendMessage({ type: 'GET_JOBS' });
  allJobs = jobs;
  initFilters();
  initSortHeaders();
  initSelectAll();
  initSettingsModal();
  render();
});

function initFilters() {
  document.getElementById('search-input').addEventListener('input', e => {
    filterState.query = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById('status-filter').addEventListener('change', e => {
    filterState.status = e.target.value;
    render();
  });
}

function initSortHeaders() {
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.dir = 'asc';
      }
      render();
    });
  });
}

function getDisplayedJobs() {
  let jobs = [...allJobs];

  if (filterState.query) {
    const q = filterState.query;
    jobs = jobs.filter(j =>
      (j.role || '').toLowerCase().includes(q) ||
      (j.company || '').toLowerCase().includes(q) ||
      (j.location || '').toLowerCase().includes(q)
    );
  }
  if (filterState.status) {
    jobs = jobs.filter(j => j.status === filterState.status);
  }

  jobs.sort((a, b) => {
    const av = (a[sortState.col] || '').toLowerCase();
    const bv = (b[sortState.col] || '').toLowerCase();
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortState.dir === 'asc' ? cmp : -cmp;
  });

  return jobs;
}

function render() {
  const displayed = getDisplayedJobs();
  const total = allJobs.length;
  const countEl = document.getElementById('job-count');
  const emptyEl = document.getElementById('empty-state');
  const tableWrap = document.getElementById('table-wrap');
  const tbody = document.getElementById('jobs-body');

  // Update sort indicators on headers
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.removeAttribute('data-dir');
    if (th.dataset.col === sortState.col) th.dataset.dir = sortState.dir;
  });

  if (displayed.length < total) {
    countEl.textContent = `${displayed.length} of ${total} jobs`;
  } else {
    countEl.textContent = total === 1 ? '1 job' : `${total} jobs`;
  }

  tbody.innerHTML = '';
  updateSelectionUI();

  if (displayed.length === 0) {
    emptyEl.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  for (const job of displayed) {
    tbody.appendChild(buildRow(job));
  }
}

function buildRow(job) {
  const tr = document.createElement('tr');
  tr.dataset.id = job.id;
  tr.appendChild(buildCheckboxCell(job));
  tr.appendChild(buildEditableCell(job, 'role', 'role-cell'));
  tr.appendChild(buildEditableCell(job, 'company', 'company-cell'));
  tr.appendChild(buildEditableCell(job, 'deadline', 'mono'));
  tr.appendChild(buildEditableCell(job, 'pay', 'mono'));
  tr.appendChild(buildEditableCell(job, 'location', 'mono'));
  tr.appendChild(buildStatusCell(job));
  tr.appendChild(buildApplyCell(job));
  tr.appendChild(buildDeleteCell(job, tr));
  return tr;
}

function buildEditableCell(job, field, cls) {
  const cell = document.createElement('td');
  cell.className = (cls ? cls + ' ' : '') + 'editable-cell';
  cell.textContent = job[field] || '—';
  cell.title = 'Click to edit';

  cell.addEventListener('click', () => {
    makeEditable(cell, job, field, () => {
      cell.textContent = job[field] || '—';
    });
  });

  return cell;
}

function makeEditable(cell, job, field, restoreCell) {
  if (cell.querySelector('.inline-edit')) return;

  const original = job[field];
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit';
  input.value = original || '';

  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  async function commit() {
    if (committed) return;
    committed = true;
    const newVal = input.value.trim() || null;
    job[field] = newVal;
    restoreCell();
    if (newVal !== original) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_JOB',
        id: job.id,
        fields: { [field]: newVal },
      });
    }
  }

  function cancel() {
    if (committed) return;
    committed = true;
    job[field] = original;
    restoreCell();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function buildApplyCell(job) {
  const cell = document.createElement('td');
  cell.className = 'apply-cell';
  renderApplyContent(cell, job);
  return cell;
}

function renderApplyContent(cell, job) {
  cell.textContent = '';

  if (job.applyUrl) {
    const a = document.createElement('a');
    a.href = job.applyUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = job.applyUrl;
    a.textContent = 'Apply';
    a.className = 'apply-link';
    cell.appendChild(a);
  } else {
    const dash = document.createElement('span');
    dash.textContent = '—';
    dash.className = 'muted';
    cell.appendChild(dash);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'apply-edit-btn';
  editBtn.textContent = '✎';
  editBtn.title = 'Edit URL';
  editBtn.addEventListener('click', e => {
    e.stopPropagation();
    makeEditable(cell, job, 'applyUrl', () => renderApplyContent(cell, job));
  });
  cell.appendChild(editBtn);
}

function buildStatusCell(job) {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  select.className = `status-select status-${job.status}`;

  for (const val of STATUSES) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val.charAt(0).toUpperCase() + val.slice(1);
    if (val === job.status) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', async () => {
    const newStatus = select.value;
    select.className = `status-select status-${newStatus}`;
    job.status = newStatus;
    await chrome.runtime.sendMessage({ type: 'UPDATE_STATUS', id: job.id, status: newStatus });
  });

  cell.appendChild(select);
  return cell;
}

function buildCheckboxCell(job) {
  const cell = document.createElement('td');
  cell.className = 'check-col';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = selectedIds.has(job.id);
  cb.addEventListener('change', () => {
    if (cb.checked) selectedIds.add(job.id);
    else selectedIds.delete(job.id);
    updateSelectionUI();
  });
  cell.appendChild(cb);
  return cell;
}

function initSelectAll() {
  const selectAllEl = document.getElementById('select-all');
  const deleteBtn = document.getElementById('delete-selected-btn');

  selectAllEl.addEventListener('change', () => {
    const displayed = getDisplayedJobs();
    if (selectAllEl.checked) {
      displayed.forEach(j => selectedIds.add(j.id));
    } else {
      displayed.forEach(j => selectedIds.delete(j.id));
    }
    document.querySelectorAll('#jobs-body input[type="checkbox"]').forEach(cb => {
      cb.checked = selectedIds.has(cb.closest('tr').dataset.id);
    });
    updateSelectionUI();
  });

  deleteBtn.addEventListener('click', async () => {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} job${count === 1 ? '' : 's'}?`)) return;
    for (const id of selectedIds) {
      await chrome.runtime.sendMessage({ type: 'DELETE_JOB', id });
    }
    allJobs = allJobs.filter(j => !selectedIds.has(j.id));
    selectedIds.clear();
    render();
  });
}

function updateSelectionUI() {
  const displayed = getDisplayedJobs();
  const selectAllEl = document.getElementById('select-all');
  const deleteBtn = document.getElementById('delete-selected-btn');
  const visibleSelected = displayed.filter(j => selectedIds.has(j.id)).length;

  if (selectedIds.size === 0) {
    deleteBtn.classList.add('hidden');
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
  } else {
    deleteBtn.classList.remove('hidden');
    deleteBtn.textContent = `Delete (${selectedIds.size})`;
    if (visibleSelected === displayed.length && displayed.length > 0) {
      selectAllEl.checked = true;
      selectAllEl.indeterminate = false;
    } else if (visibleSelected === 0) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
    } else {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = true;
    }
  }
}

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('open-settings');
  const closeBtn = document.getElementById('close-modal');
  const toggleBtn = document.getElementById('toggle-key');
  const saveBtn = document.getElementById('save-settings-btn');
  const apiKeyInput = document.getElementById('api-key');
  const modelInput = document.getElementById('model');
  const statusEl = document.getElementById('settings-save-status');

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  toggleBtn.addEventListener('click', () => {
    const isPass = apiKeyInput.type === 'password';
    apiKeyInput.type = isPass ? 'text' : 'password';
    toggleBtn.textContent = isPass ? 'Hide' : 'Show';
  });

  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    if (!apiKey) { setStatus('API key is required.', 'error'); return; }
    saveBtn.disabled = true;
    await chrome.storage.sync.set({ apiKey, model });
    setStatus('Saved!', 'success');
    setTimeout(() => { setStatus('', ''); saveBtn.disabled = false; }, 2000);
  });

  if (window.location.hash === '#settings') openModal();

  async function openModal() {
    const settings = await chrome.storage.sync.get(['apiKey', 'model']);
    apiKeyInput.value = settings.apiKey || '';
    modelInput.value = settings.model || '';
    apiKeyInput.type = 'password';
    toggleBtn.textContent = 'Show';
    setStatus('', '');
    modal.classList.remove('hidden');
    setTimeout(() => apiKeyInput.focus(), 50);
  }

  function closeModal() {
    modal.classList.add('hidden');
    history.replaceState(null, '', location.pathname);
  }

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'save-status' + (type ? ' ' + type : '');
  }
}

function buildDeleteCell(job, tr) {
  const cell = document.createElement('td');
  cell.className = 'delete-cell';
  const btn = document.createElement('button');
  btn.className = 'delete-btn';
  btn.title = 'Remove job';
  btn.textContent = '✕';

  btn.addEventListener('click', async () => {
    if (!confirm(`Remove "${job.role}" at ${job.company}?`)) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_JOB', id: job.id });
    allJobs = allJobs.filter(j => j.id !== job.id);
    render();
  });

  cell.appendChild(btn);
  return cell;
}
