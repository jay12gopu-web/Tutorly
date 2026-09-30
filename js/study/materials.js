(function (root) {
  'use strict';
  const MAX_TEXT = 24000;
  async function readFile(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB.');
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'txt') {
      const text = (await file.text()).replace(/\0/g, '').trim();
      if (!text) throw new Error('This file is empty. Try another file.');
      return { text: text.slice(0, MAX_TEXT), partial: text.length > MAX_TEXT };
    }
    const photo = ['png', 'jpg', 'jpeg'].includes(extension);
    if (!photo && extension !== 'pdf') throw new Error('Use PDF, TXT, JPG or PNG.');
    const form = new FormData(); form.append(photo ? 'image' : 'file', file);
    const token = root.TutorlyAuth?.getSessionToken?.();
    const controller = new AbortController(), timer = root.setTimeout(() => controller.abort(), 45000);
    try {
      const origin = root.TutorlyAuth?.backendOrigin?.();
      if (!origin) throw new Error('The document reader is unavailable. You can paste your notes instead.');
      const response = await fetch(`${origin}${photo ? '/api/vision/extract' : '/api/study/material/extract'}`, {
        method: 'POST', body: form, signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Could not read this file. Retry, or paste your notes.');
      if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('No readable text was found. Paste your notes instead.');
      return { text: payload.text.slice(0, MAX_TEXT), partial: !!payload.partial || payload.text.length > MAX_TEXT };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Reading took too long. Retry or paste the relevant text.');
      throw error;
    } finally { root.clearTimeout(timer); }
  }
  // Keep sources associated with selected topics. Never turn extracted text into verified curriculum.
  function excerpts(materials, topicId) {
    let remaining = 12000;
    return (materials || []).filter(item => !item.topicIds?.length || item.topicIds.includes(topicId)).slice(0, 5).map(item => {
      const text = String(item.text || '').slice(0, Math.min(6000, remaining)); remaining -= text.length;
      return { label: String(item.label || 'My notes').slice(0, 150), text, partial: !!item.partial || text.length < String(item.text || '').length };
    }).filter(item => item.text);
  }
  root.TutorlyStudyMaterials = Object.freeze({ readFile, excerpts, MAX_TEXT });
})(window);
