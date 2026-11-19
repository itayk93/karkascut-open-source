/** Replace only the analyzed interval, preserving neighboring edits and locked cuts. */
export function replaceCutWindow<T extends { id: string; start: number; end: number; locked?: boolean }>(
  cuts: T[], replacements: T[], start: number, end: number, createId: () => string
): T[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return cuts;
  const outside = cuts.flatMap((cut): T[] => {
    if (cut.locked || cut.end <= start || cut.start >= end) return [cut];
    const pieces: T[] = [];
    if (cut.start < start) pieces.push({ ...cut, end: start });
    if (cut.end > end) pieces.push({ ...cut, id: pieces.length ? createId() : cut.id, start: end });
    return pieces;
  });
  const inside = replacements
    .filter((cut) => Number.isFinite(cut.start) && Number.isFinite(cut.end))
    .map((cut) => ({ ...cut, start: Math.max(start, cut.start), end: Math.min(end, cut.end) }))
    .filter((cut) => cut.end > cut.start);
  return [...outside, ...inside].sort((a, b) => a.start - b.start);
}
