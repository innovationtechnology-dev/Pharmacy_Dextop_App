#!/usr/bin/env node

const { spawn } = require('child_process');
const process = require('process');

// Get the command and arguments
const [, , ...args] = process.argv;

// Spawn the actual command
const child = spawn(args[0], args.slice(1), {
  stdio: ['inherit', 'inherit', 'pipe'],
  shell: true,
});

// Filter stderr to remove SSL errors
child.stderr.on('data', (data) => {
  const message = data.toString();
  // Filter out SSL handshake errors
  if (
    !message.includes('ssl_client_socket_impl.cc') &&
    !message.includes('handshake failed') &&
    !message.includes('ERROR:ssl')
  ) {
    // Write non-SSL errors to stderr
    process.stderr.write(data);
  }
});

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Error spawning process:', error);
  process.exit(1);
});
