export const parseRemarks = (remarks) => {
  if (!remarks) return [];
  if (typeof remarks === 'string') {
    const trimmed = remarks.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(remarks)) return remarks;
  return [];
};

export const serializeRemarks = (remarks) => {
  if (!remarks) return JSON.stringify([]);
  if (Array.isArray(remarks)) return JSON.stringify(remarks);
  if (typeof remarks === 'string') {
    const trimmed = remarks.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch (e) {}
    }
    const splitArr = remarks
      .split(/,|\n/)
      .map(s => s.trim())
      .filter(Boolean);
    return JSON.stringify(splitArr);
  }
  return JSON.stringify([]);
};
