// Preloaded with --import by scripts/measure.mjs: answers "metrics" on the IPC channel with this process's own numbers.
process.on('message', (message) => {
  if (message !== 'metrics' || !process.send) return;
  const { user, system } = process.cpuUsage();
  const { rss, heapUsed, external } = process.memoryUsage();
  process.send({ rss, heapUsed, external, cpuMs: (user + system) / 1000 });
});
