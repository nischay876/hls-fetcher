#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const start = require('./index');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .usage('Fetch and save the contents of an HLS playlist locally.\nUsage: $0')
  .option('input', {
    alias: 'i',
    describe: 'uri to m3u8 (required)',
    type: 'string'
  })
  .option('output', {
    alias: 'o',
    describe: "output path (default:'./hls-fetcher')",
    type: 'string'
  })
  .option('playback-id', {
    alias: 'p',
    describe: 'Mux playback ID (shortcut for https://stream.mux.com/{ID}.m3u8)',
    type: 'string'
  })
  .option('concurrency', {
    alias: 'c',
    describe: 'number of simultaneous fetches (default: 10)',
    type: 'number',
    default: 10
  })
  .option('decrypt', {
    alias: 'd',
    describe: 'decrypt and remove encryption from manifest (default: false)',
    type: 'boolean',
    default: false
  })
  .help()
  .argv;

// Handle playback ID shortcut
let inputUrl, outputPath;
if (argv.p) {
  inputUrl = `https://stream.mux.com/${argv.p}.m3u8`;
  outputPath = argv.o || `./${argv.p}`;
  console.log(`🎬 Using Mux Playback ID: ${argv.p}`);
} else if (argv.i) {
  inputUrl = argv.i;
  outputPath = argv.o || './mux-hls-fetcher';
} else {
  console.error('❌ ERROR: Either -i/--input or -p/--playback-id is required');
  process.exit(1);
}

// Make output path absolute
const output = path.resolve(outputPath);
const startTime = Date.now();
const options = {
  input: inputUrl,
  output,
  concurrency: argv.concurrency,
  decrypt: argv.decrypt
};

console.log(`🚀 Starting Mux HLS fetcher...`);
console.log(`📥 Input: ${inputUrl}`);
console.log(`📁 Output: ${output}`);
console.log(`⚡ Concurrency: ${options.concurrency}`);
console.log(`🔐 Decrypt: ${options.decrypt}`);

start(options).then(function() {
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('✅ Operation completed successfully in', timeTaken, 'seconds.');
  process.exit(0);
}).catch(function(error) {
  console.error('❌ ERROR:', error);
  process.exit(1);
});
