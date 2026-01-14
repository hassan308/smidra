export async function translateText(text: string, lang: string): Promise<string> {
  if (!text || lang === 'sv') return text;

  // Try Google Translate first
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=sv&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await res.json();
    const result = data?.[0]?.map((i: any) => i[0]).join('');
    if (result) return result;
  } catch {
    // Fall through to Lingva
  }

  // Fallback to Lingva
  try {
    const res = await fetch(
      `https://lingva.ml/api/v1/sv/${lang}/${encodeURIComponent(text)}`
    );
    const data = await res.json();
    return data?.translation || text;
  } catch {
    return text;
  }
}

export async function translateBatch(texts: string[], lang: string): Promise<string[]> {
  if (!texts.length || lang === 'sv') return texts;

  try {
    const delimiter = ' ||| ';
    const translated = await translateText(texts.join(delimiter), lang);
    return translated.split(delimiter).map(t => t.trim());
  } catch {
    return texts;
  }
}

export async function translateJobs<T extends { title: string; location: string }>(
  jobs: T[],
  lang: string
): Promise<T[]> {
  if (!jobs.length || lang === 'sv') return jobs;

  const [titles, locations] = await Promise.all([
    translateBatch(jobs.map(j => j.title), lang),
    translateBatch(jobs.map(j => j.location), lang)
  ]);

  return jobs.map((job, i) => ({
    ...job,
    title: titles[i] || job.title,
    location: locations[i] || job.location
  }));
}

export async function translateLabels<T extends Record<string, string>>(
  labels: T,
  lang: string
): Promise<T> {
  if (lang === 'sv') return labels;

  const keys = Object.keys(labels);
  const vals = await translateBatch(Object.values(labels), lang);

  return keys.reduce((acc, k, i) => ({
    ...acc,
    [k]: vals[i] || labels[k]
  }), {} as T);
}
