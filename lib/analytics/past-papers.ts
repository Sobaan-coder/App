// Past-paper analytics. Purely descriptive of the papers the student uploaded —
// it never claims anything about future exams.

export type PaperIn = { id: string; year: number | null; title: string };
export type QuestionIn = { id: string; paperId: string; marks: number | null; type: string };
export type LinkIn = { questionId: string; topicId: string; confidence: number };
export type TopicIn = { id: string; name: string; chapterId: string; chapterName: string; chapterOrder: number; order: number };

export type TopicAnalytics = {
  topicId: string;
  name: string;
  chapter: string;
  paperCount: number;
  totalPapers: number;
  frequency: number; // 0–1 share of papers
  questionCount: number;
  marks: number;
  appearedIn: Record<string, boolean>; // paper label → appeared
  trend: "rising" | "steady" | "falling" | "none";
  lastSeen: string | null;
};

export type PaperAnalytics = {
  papers: { id: string; label: string }[];
  topics: TopicAnalytics[];
  chapterMarks: { chapter: string; marks: number; share: number }[];
  types: { type: string; count: number }[];
  repeated: TopicAnalytics[];
  unexamined: TopicAnalytics[];
  totalQuestions: number;
  mappedShare: number; // share of questions mapped to at least one topic
};

/** Papers ordered oldest → newest; label is the year, or the title when the year is unknown. */
function orderPapers(papers: PaperIn[]) {
  const sorted = [...papers].sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
  const counts = new Map<string, number>();
  return sorted.map((p) => {
    let label = p.year ? String(p.year) : p.title;
    const n = (counts.get(label) ?? 0) + 1;
    counts.set(label, n);
    if (n > 1) label = `${label} (${n})`;
    return { id: p.id, label };
  });
}

export function computePaperAnalytics(papers: PaperIn[], questions: QuestionIn[], links: LinkIn[], topics: TopicIn[]): PaperAnalytics {
  const ordered = orderPapers(papers);
  const labelOf = new Map(ordered.map((p) => [p.id, p.label]));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  // Primary topic per question gets its marks (avoid double counting).
  const primary = new Map<string, string>();
  for (const l of [...links].sort((a, b) => b.confidence - a.confidence)) if (!primary.has(l.questionId)) primary.set(l.questionId, l.topicId);

  const topicMap = new Map<string, { papers: Set<string>; questions: Set<string>; marks: number }>();
  for (const l of links) {
    const q = questionById.get(l.questionId);
    if (!q) continue;
    const t = topicMap.get(l.topicId) ?? { papers: new Set(), questions: new Set(), marks: 0 };
    t.papers.add(q.paperId);
    if (!t.questions.has(q.id)) {
      t.questions.add(q.id);
      if (primary.get(q.id) === l.topicId) t.marks += q.marks ?? 0;
    }
    topicMap.set(l.topicId, t);
  }

  const half = Math.floor(ordered.length / 2);
  const older = new Set(ordered.slice(0, half).map((p) => p.id));
  const recent = new Set(ordered.slice(ordered.length - Math.max(1, Math.ceil(ordered.length / 2))).map((p) => p.id));

  const topicStats: TopicAnalytics[] = [...topics]
    .sort((a, b) => a.chapterOrder - b.chapterOrder || a.order - b.order)
    .map((t) => {
      const s = topicMap.get(t.id);
      const appearedIn: Record<string, boolean> = {};
      for (const p of ordered) appearedIn[p.label] = !!s?.papers.has(p.id);
      const inRecent = s ? [...s.papers].filter((p) => recent.has(p)).length / Math.max(recent.size, 1) : 0;
      const inOlder = s ? [...s.papers].filter((p) => older.has(p)).length / Math.max(older.size, 1) : 0;
      let trend: TopicAnalytics["trend"] = "none";
      if (s && ordered.length >= 3) trend = inRecent - inOlder > 0.25 ? "rising" : inOlder - inRecent > 0.25 ? "falling" : "steady";
      else if (s) trend = "steady";
      const seen = ordered.filter((p) => s?.papers.has(p.id));
      return {
        topicId: t.id,
        name: t.name,
        chapter: t.chapterName,
        paperCount: s?.papers.size ?? 0,
        totalPapers: ordered.length,
        frequency: ordered.length ? (s?.papers.size ?? 0) / ordered.length : 0,
        questionCount: s?.questions.size ?? 0,
        marks: s?.marks ?? 0,
        appearedIn,
        trend,
        lastSeen: seen.length ? seen[seen.length - 1].label : null,
      };
    });

  const chapterTotals = new Map<string, number>();
  for (const t of topicStats) chapterTotals.set(t.chapter, (chapterTotals.get(t.chapter) ?? 0) + t.marks);
  const totalMarks = [...chapterTotals.values()].reduce((a, b) => a + b, 0);

  const typeCounts = new Map<string, number>();
  for (const q of questions) typeCounts.set(q.type, (typeCounts.get(q.type) ?? 0) + 1);

  const mapped = new Set(links.map((l) => l.questionId));
  return {
    papers: ordered,
    topics: topicStats,
    chapterMarks: [...chapterTotals.entries()].map(([chapter, marks]) => ({ chapter, marks, share: totalMarks ? marks / totalMarks : 0 })),
    types: [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    repeated: topicStats.filter((t) => t.questionCount >= 3).sort((a, b) => b.questionCount - a.questionCount),
    unexamined: topicStats.filter((t) => t.paperCount === 0),
    totalQuestions: questions.length,
    mappedShare: questions.length ? questions.filter((q) => mapped.has(q.id)).length / questions.length : 0,
  };
}

/** Descriptive wording only — never predictive. */
export function frequencyPhrase(t: Pick<TopicAnalytics, "paperCount" | "totalPapers">) {
  if (t.totalPapers === 0) return "No papers analysed yet.";
  if (t.paperCount === 0) return "Not found in your uploaded papers.";
  const share = t.paperCount / t.totalPapers;
  const how = share >= 0.75 ? "frequently" : share >= 0.4 ? "regularly" : "occasionally";
  return `Historically, this topic appeared ${how} in the uploaded papers (${t.paperCount} of ${t.totalPapers}).`;
}
