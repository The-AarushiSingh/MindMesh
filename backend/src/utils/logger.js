const write = (level, event, fields = {}) => {
  const payload = {
    level,
    time: new Date().toISOString(),
    event,
    ...fields,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};

const logger = {
  info(event, fields) {
    write("info", event, fields);
  },
  warn(event, fields) {
    write("warn", event, fields);
  },
  error(event, fields) {
    write("error", event, fields);
  },
};

module.exports = logger;
