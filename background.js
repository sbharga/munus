const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'CHECK_URL':
      handleCheckUrl(message.url).then(sendResponse);
      return true;
    case 'SAVE_JOB':
      handleSaveJob(message.url, message.tabId).then(sendResponse);
      return true;
    case 'GET_JOBS':
      handleGetJobs().then(sendResponse);
      return true;
    case 'UPDATE_STATUS':
      handleUpdateStatus(message.id, message.status).then(sendResponse);
      return true;
    case 'UPDATE_JOB':
      handleUpdateJob(message.id, message.fields).then(sendResponse);
      return true;
    case 'DELETE_JOB':
      handleDeleteJob(message.id).then(sendResponse);
      return true;
  }
});

async function getJobs() {
  const result = await chrome.storage.local.get('jobs');
  return result.jobs || [];
}

async function saveJobs(jobs) {
  await chrome.storage.local.set({ jobs });
}

async function handleCheckUrl(url) {
  const jobs = await getJobs();
  const job = jobs.find(j => j.url === url);
  return job ? { exists: true, job } : { exists: false };
}

async function handleSaveJob(url, tabId) {
  const jobs = await getJobs();
  if (jobs.some(j => j.url === url)) {
    return { success: false, error: 'duplicate' };
  }

  const settings = await chrome.storage.sync.get(['apiKey', 'model']);
  if (!settings.apiKey) {
    return { success: false, error: 'no_api_key' };
  }

  let text;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapePageText,
    });
    text = results[0].result;
  } catch (e) {
    return { success: false, error: 'scrape_failed' };
  }

  const model = settings.model || DEFAULT_MODEL;
  let parsed;
  try {
    parsed = await parseJobWithLLM(text, url, settings.apiKey, model);
  } catch (e) {
    return { success: false, error: 'parse_failed', detail: e.message };
  }

  const job = {
    id: crypto.randomUUID(),
    url,
    savedAt: new Date().toISOString(),
    status: 'saved',
    role: parsed.role || 'Unknown Role',
    company: parsed.company || 'Unknown Company',
    deadline: parsed.deadline || null,
    applyUrl: parsed.applyUrl || null,
    pay: parsed.pay || null,
    location: parsed.location || null,
  };

  jobs.unshift(job);
  await saveJobs(jobs);
  return { success: true, job };
}

function scrapePageText() {
  return document.body.innerText.slice(0, 15000);
}

async function parseJobWithLLM(text, url, apiKey, model) {
  const systemPrompt = `Extract job info and return ONLY a JSON object (null for missing fields):
{"role":"","company":"","deadline":"","applyUrl":"","pay":"","location":""}

Pay format: currency symbol + number + /hr or /yr. Use k for thousands. Examples: "$45/hr", "$90k–$120k/yr".
Location: one place only, e.g. "Remote" or "Austin, TX".
No markdown, no explanation.`;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://munus.app',
      'X-Title': 'Munus Job Tracker',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Job URL: ${url}\n\n${text}` },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content.trim();
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(clean);
}

async function handleGetJobs() {
  const jobs = await getJobs();
  return { jobs };
}

async function handleUpdateStatus(id, status) {
  const jobs = await getJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return { success: false };
  jobs[idx].status = status;
  await saveJobs(jobs);
  return { success: true };
}

async function handleUpdateJob(id, fields) {
  const jobs = await getJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return { success: false };
  Object.assign(jobs[idx], fields);
  await saveJobs(jobs);
  return { success: true };
}

async function handleDeleteJob(id) {
  const jobs = await getJobs();
  await saveJobs(jobs.filter(j => j.id !== id));
  return { success: true };
}
