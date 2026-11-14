export type ProbeSource = {
  id: string;
  company: string;
  label: string;
  original: string;
  timestamp: string;
  reason: string;
};

export const PROBE_SOURCES: ProbeSource[] = [
  { id: 'zoom-baseline', company: 'Zoom', label: 'Terms · 1 Mar 2023', original: 'https://explore.zoom.us/en/terms/', timestamp: '20230301000542', reason: 'Before the 2023 AI terms language.' },
  { id: 'zoom-change', company: 'Zoom', label: 'Terms · 12 Aug 2023', original: 'https://explore.zoom.us/en/terms/', timestamp: '20230812065407', reason: 'After the AI and customer content clarification.' },
  { id: 'x-baseline', company: 'X', label: 'Privacy · 1 Jan 2023', original: 'https://twitter.com/en/privacy', timestamp: '20230101004225', reason: 'Before the AI training clause.' },
  { id: 'x-change', company: 'X', label: 'Privacy · 29 Sep 2023', original: 'https://twitter.com/en/privacy', timestamp: '20230929213507', reason: 'After the AI training clause appeared.' },
  { id: 'adobe-baseline', company: 'Adobe', label: 'General Terms · 5 Jun 2024', original: 'https://www.adobe.com/legal/terms.html', timestamp: '20240605152629', reason: 'Baseline for the content access wording review.' },
  { id: 'adobe-change', company: 'Adobe', label: 'General Terms · 10 Jun 2024', original: 'https://www.adobe.com/legal/terms.html', timestamp: '20240610032329', reason: 'Later capture for an honest comparison.' },
  { id: 'zoom-ai-grant', company: 'Zoom', label: 'Terms · 9 Aug 2023', original: 'https://explore.zoom.us/en/terms/', timestamp: '20230809192857', reason: 'The original explicit AI-training permission, before the 11 August clarification.' },
  { id: 'adobe-june-revision', company: 'Adobe', label: 'General Terms · 19 Jun 2024', original: 'https://www.adobe.com/legal/terms.html', timestamp: '20240619003609', reason: 'The actual June 18 revision; the June 5 and June 10 captures have identical normalized text.' },
];

export function cdxUrl(source: ProbeSource): string {
  const params = new URLSearchParams({
    url: source.original,
    output: 'json',
    filter: 'statuscode:200',
    fl: 'timestamp,original,statuscode',
    from: source.timestamp,
    to: source.timestamp,
  });
  return `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
}

export function snapshotUrl(source: ProbeSource): string {
  return `https://web.archive.org/web/${source.timestamp}id_/${source.original}`;
}
