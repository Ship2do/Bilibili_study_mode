function collectKeywordTexts(metadata) {
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return [metadata.title, metadata.tname, metadata.ownerName, metadata.ownerSign, metadata.desc, ...tags];
}
