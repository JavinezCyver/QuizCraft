// Compatibility entry point for older administrator commands.
process.argv.splice(2, 0, "admin");
await import("./server.mjs");
