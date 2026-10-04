const serializeResource = (resource, { includeContent = false } = {}) => {
  const doc = resource?.toObject ? resource.toObject() : { ...resource };
  delete doc.embedding;
  delete doc.__v;

  if (!includeContent) {
    delete doc.content;
  }

  return doc;
};

module.exports = {
  serializeResource,
};
